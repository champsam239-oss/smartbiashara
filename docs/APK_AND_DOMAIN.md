# Android APK and sharing domain

## Recommended: package the PWA as a Trusted Web Activity

Smart Biashara already builds as a Progressive Web App. A Trusted Web Activity (TWA) packages the HTTPS site for Android while keeping the app and web users on the same origin. It is the simplest route for this app while its login and data remain web based.

### Before packaging

1. Deploy the app to its final HTTPS domain, for example `https://app.example.com`.
2. Set the Vercel production variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SITE_URL=https://app.example.com`.
3. In Supabase Auth, set the Site URL to the canonical domain and add the exact production redirect URL(s). Keep local and preview URLs scoped to development; avoid broad wildcard redirects in production.
4. Confirm sign-in, password reset, and email confirmation links return to the production domain.
5. Confirm the PWA manifest and icons are available from the deployed domain.

### Build with Bubblewrap

Use a workstation with a current Node.js, Java JDK, and Android SDK installed. Install Google's Bubblewrap CLI, then initialize from the deployed manifest:

```sh
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://app.example.com/manifest.webmanifest
bubblewrap build
```

During setup, choose the Android application ID and app name carefully; changing the application ID later creates a different Android app. Create and securely back up a signing key. Bubblewrap produces an APK for direct installation and an Android App Bundle for Play distribution. Never lose or share the private signing key.

Publish `/.well-known/assetlinks.json` on the same domain with the application ID and SHA-256 fingerprint of the signing certificate. This Digital Asset Links file verifies that the Android app is allowed to open the domain fullscreen. Test the signed APK on real Android devices, including login redirects, camera barcode scanning, offline queue recovery, and returning to the app after following a shared link.

For Play Store release, use the App Bundle and follow Play App Signing. For direct sharing, users may install the signed APK, but Android will show install warnings and updates must be distributed by you. Keep the signing key and release process stable.

### Alternative: Capacitor

Choose Capacitor if the app needs native integrations beyond a browser-backed PWA. It requires adding Android project files, configuring native app links for Supabase email redirects, and testing native camera, storage, and lifecycle behavior. This is more work and creates another release target. Do not assume the web login redirect will automatically reopen a Capacitor app.

## Domain sharing risks and safeguards

- Use one stable HTTPS production domain in QR codes, WhatsApp links, marketing materials, Supabase redirects, and the Android Digital Asset Links file. Changing domains can break saved links, login callbacks, and TWA verification.
- Point DNS to the Vercel records shown for the project and wait for domain verification and its HTTPS certificate before sharing the URL. Use a subdomain such as `app.example.com` if the apex domain hosts a separate website.
- Keep Vercel preview domains for testing. Do not distribute preview links: they can change, may have deployment protection, and should not be added as broad production auth redirects.
- A domain is an address, not a tenant boundary. Continue enforcing business separation in Supabase RLS and role checks; never rely on obscured URLs to protect one shop's data from another.
- Plan domain renewal, DNS account recovery, and ownership access. If ownership or DNS lapses, the app and links may become unavailable or point elsewhere.
- If a custom domain is not ready, use the stable Vercel production domain consistently and configure Supabase and Android verification for that exact host.

## Official guides

- [Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Android Trusted Web Activities](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
- [Android app signing](https://developer.android.com/studio/publish/app-signing)
- [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls)
- [Vercel custom domains](https://vercel.com/docs/domains/set-up-custom-domain)
