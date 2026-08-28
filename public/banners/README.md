# Email banners

Drop one PNG per event here, named by the event's short code — `E1.png`, `E2.png`, `E3.png`.
`lib/emailBanners.ts#resolveEntryPassBanner` picks it up automatically for that event's
entry-pass email; nothing else to configure. Recommended: 1160×400 (renders at 580px wide), under 200 KB.

Without a file the email renders a dark text header with the event title, so a missing
banner never blocks sending.
