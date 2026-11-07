import { useEffect, useRef, useState } from 'react'

type DetectedCode = { rawValue: string }
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedCode[]> }
type DetectorConstructor = new (options: { formats: string[] }) => Detector

export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const callbacks = useRef({ onDetected, onClose })
  const [error, setError] = useState('')
  callbacks.current = { onDetected, onClose }

  useEffect(() => {
    let active = true
    let stream: MediaStream | undefined
    let timer = 0

    async function start() {
      const DetectorApi = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
      if (!DetectorApi) { setError('Camera scanning is not supported by this browser. Use a USB/Bluetooth barcode scanner or type the SKU.') ; return }
      if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access needs a secure HTTPS connection. You can still type the SKU.') ; return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const detector = new DetectorApi({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] })

        const scan = async () => {
          if (!active || !video.current) return
          try {
            if (video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const results = await detector.detect(video.current)
              const value = results.find(code => code.rawValue.trim())?.rawValue
              if (value) {
                callbacks.current.onDetected(value)
                callbacks.current.onClose()
                return
              }
            }
          } catch {
            if (active) setError('Could not read this barcode. Try better light or enter its SKU.')
          }
          if (active) timer = window.setTimeout(scan, 250)
        }
        void scan()
      } catch {
        if (active) setError('Camera permission was denied or the camera is busy. You can enter the SKU instead.')
      }
    }

    void start()
    return () => {
      active = false
      window.clearTimeout(timer)
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [])

  return <div className="scanner-backdrop" role="dialog" aria-modal="true" aria-label="Scan a product barcode">
    <section className="scanner-card">
      <div className="item"><h2>Scan product</h2><button className="ghost fit" onClick={onClose}>Close</button></div>
      <video ref={video} muted playsInline aria-label="Barcode camera preview" />
      {error ? <p className="err" role="status">{error}</p> : <p>Point the back camera at the product barcode.</p>}
    </section>
  </div>
}
