# Annamalai Nagar Weather Dashboard

A mobile-first static website for the Department of Agronomy, Annamalai University, focused on Annamalai Nagar / Chidambaram, Tamil Nadu.

## What this version does

- Fetches fresh Open-Meteo forecast data when the page loads and when a visitor refreshes it.
- Shows current model-estimated conditions, feels-like temperature, relative humidity, precipitation, wind, pressure and UV index.
- Shows a seven-day forecast, rainfall outlook and general agriculture-oriented reminders.
- Displays the timestamp of the weather model's current data in IST and a page refresh timestamp.
- Links to official IMD resources for forecasts and warnings.
- Includes a QR code generator that works after the website has been published on its final HTTPS URL.
- Has no public edit controls or form that lets visitors alter the website.

## Accuracy and official-data limits — please read

**The numerical live dashboard in this version uses Open-Meteo model-based estimates for approximate Annamalai Nagar coordinates (11.39, 79.72). It does not claim to be an on-campus weather-station measurement.** The model's update cycle depends on the underlying forecast model and may be delayed; a page refresh does not guarantee the underlying weather model was updated at that exact moment.

This is a transparent hybrid starting point: Open-Meteo provides the live numerical dashboard, while official IMD forecasts and warning services are linked for authoritative Indian alerts. A verified, authorised IMD station/API feed for Annamalai Nagar has **not** been connected in this version. IMD publishes APIs for current weather, AWS/ARG observations, forecasts and district warnings, but station matching, API access/credentials, terms, and browser access must be verified before wiring a station feed into this public website.

Do not label the dashboard “official IMD live observations” until a suitable station feed has been identified and validated. If the department has campus Automatic Weather Station (AWS) data, it may be the best source for true campus observations.

NASA POWER is useful for research-oriented gridded meteorological/climatological data, but it is not a replacement for a validated live campus weather station. It should not be used to imply minute-by-minute local observations.

## Use in the same GitHub account as your portfolio

Yes. You can keep your existing portfolio and create this as a **separate project repository** in the same GitHub account.

Recommended repository name: `annamalai-nagar-weather`

If your portfolio is already published from a repository named `YOUR-USERNAME.github.io`, leave that repository alone. This project can have its own GitHub Pages URL:

`https://YOUR-USERNAME.github.io/annamalai-nagar-weather/`

Replace `YOUR-USERNAME` with your exact GitHub username after you create the repository. The portfolio and weather site remain separate websites. Do **not** upload these files over the root of your existing portfolio repository.

## Publish on GitHub Pages

1. Sign in to GitHub.
2. Go to https://github.com/new
3. Repository name: `annamalai-nagar-weather`.
4. Select **Public** (GitHub Pages availability depends on account/repository settings; public is the straightforward free option).
5. Create the repository.
6. Extract the ZIP on your computer.
7. Upload the **contents** of the extracted folder to the repository root. Ensure `index.html`, `styles.css`, `app.js`, `README.md`, and `.github/workflows/deploy.yml` are present. The `.github` folder may be hidden on some computers, so check it carefully.
8. Commit the uploaded files to the `main` branch.
9. Open **Settings → Pages** and set the publishing source to **GitHub Actions**.
10. Open **Actions** and wait for the workflow named “Deploy static weather site” to complete successfully.
11. Open the published URL shown by GitHub. It will usually be `https://YOUR-USERNAME.github.io/annamalai-nagar-weather/`.
12. Test on mobile data and Wi-Fi, and confirm that weather values load, timestamps display, and IMD links open.

## Permanent QR code

1. Open the deployed website at its final HTTPS address.
2. Tap **Generate QR code for this page**.
3. Tap **Download QR PNG**.
4. Scan the downloaded QR with another phone before printing.
5. Keep the repository name and published URL unchanged. You can update the files in the same repository later and the QR will continue to open that URL.

A QR code created before deployment from a temporary/local URL is not suitable for printing.

## No public editing

The website itself has no edit button, no public submission form, and no visitor-facing content-management feature. Visitors can only view the information and use the links. As repository owner, you control website changes through your GitHub account. Keep two-factor authentication enabled and do not share account credentials.

Note: if the repository is public, the source code is visible to the public, even though visitors cannot edit the published site through the website interface. If code confidentiality is important, review your GitHub plan's Pages repository-visibility rules before choosing repository visibility.

## Sources

- Open-Meteo documentation: https://open-meteo.com/en/docs
- Open-Meteo model updates / data availability: https://open-meteo.com/en/docs/model-updates
- Open-Meteo terms and attribution: https://open-meteo.com/
- IMD API reference: https://api.imd.gov.in/public/api_reference.html
- IMD API access portal: https://api.imd.gov.in/public/index.php
- IMD official weather website: https://mausam.imd.gov.in/
- IMD city forecast portal: https://city.imd.gov.in/
- GitHub Pages publishing source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Open-Meteo attribution is included in the site footer. Confirm current terms and usage limits before any expanded or institutional deployment.

## Files

- `index.html` — dashboard layout, official links and attribution.
- `styles.css` — responsive professional styling.
- `app.js` — Open-Meteo API integration, timestamps, charts, general reminders and QR generation.
- `.github/workflows/deploy.yml` — automated GitHub Pages deployment.
