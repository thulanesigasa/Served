# Served

Served turns a restaurant guest’s phone into a buzzer for tables and order pickups. Staff manage the queue and generate a guest QR code. A guest can scan the code in their camera to use the website or open it in the Expo app.

[Open Served](https://served-queue.zippybasil1024.chatgpt.site)

## Website

Run `npm ci` and `npm run dev` with Node.js 24 or newer. Local preview uses SQLite and the hosted Worker uses D1. `npm test` checks the queue API. `npm run build` creates the deployable Worker. GitHub Actions builds the web artifact on each push to `main` or `development`.

Open the staff dashboard and select **Set up a venue** to get a live queue. Open **Guest QR** to download the venue’s QR code. Keep a copy of the venue’s staff access key if you need to open the same queue on another device.

## Mobile app

The Expo app is in `mobile/`. Guests can scan a QR code, paste a guest link, reopen their last ticket, and receive an in-app sound and vibration when called. Live alerts require Served to remain open. The native app uses the hosted queue unless `EXPO_PUBLIC_SERVED_URL` is configured in the matching Expo environment.

Use **Actions → Served mobile build or OTA → Run workflow**.

| Profile | Android artifact | OTA channel |
| --- | --- | --- |
| Development | Installable APK | `development` |
| Production | Google Play AAB | `production` |

The workflow uses the repository’s **EXPO_TOKEN** Actions secret. Set **EXPO_PROJECT_ID** as an Actions variable when linking to an existing Expo project by its UUID. Otherwise the workflow resolves or creates the `served` project under the token’s Expo account. Each requested platform and signing profile needs EAS credentials before the first non-interactive build. Production runs from `main`.

Select **build** to create a binary or **ota** to publish an update to the matching channel. Binary downloads appear in EAS and the GitHub job log. The workflow builds binaries and does not submit them to app stores.

The app’s release version is set in `mobile/app.json` independently of the literal OTA runtime **1.0.1**. Publish compatible JavaScript and asset updates to the build’s channel. Native dependency and configuration changes require reviewing binary compatibility before publishing OTA.
