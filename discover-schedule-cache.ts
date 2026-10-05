/// <reference path="./plugin.d.ts" />

/*
 * Cached Discover Schedule
 *
 * SeaAnime's built-in Discover > Schedule tab creates new time-based query
 * keys each time it mounts. A plugin cannot change those React Query keys, so
 * this plugin provides the same two-week schedule in its own screen and owns
 * the cache for the lifetime of the running app.
 */

function init() {
    $ui.register(function(ctx: $ui.Context) {
        // Everything below lives inside $ui.register deliberately. SeaAnime
        // executes this callback in its dedicated UI runtime, rather than in
        // the loader runtime that calls init().
        const PLUGIN_ID = "cached-discover-schedule"
        const CACHE_KEY = "discover-schedule.data.v1"
        const DAY = 24 * 60 * 60 * 1000

        type ScheduleItem = {
            id: number
            mediaId: number
            title: string
            image: string
            episode: number
            airingAt: number
        }

        type CachedSchedule = {
            items: ScheduleItem[]
            refreshedAt: number
        }

        function escapeHtml(value: any): string {
            return String(value == null ? "" : value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;")
                .replace(/'/g, "&#39;")
        }

        function localDayKey(timestamp: number): string {
            const date = new Date(timestamp * 1000)
            return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate()
        }

        function dayLabel(timestamp: number): string {
            const date = new Date(timestamp * 1000)
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
            return days[date.getDay()] + ", " + months[date.getMonth()] + " " + date.getDate()
        }

        function timeLabel(timestamp: number): string {
            const date = new Date(timestamp * 1000)
            let hour = date.getHours()
            const minute = date.getMinutes() < 10 ? "0" + date.getMinutes() : String(date.getMinutes())
            const suffix = hour >= 12 ? "PM" : "AM"
            hour = hour % 12 || 12
            return hour + ":" + minute + " " + suffix
        }

        function refreshedLabel(timestamp: number): string {
            const date = new Date(timestamp)
            return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + timeLabel(Math.floor(timestamp / 1000))
        }

        function asScheduleItems(response: any): ScheduleItem[] {
            const schedules = response && response.Page && response.Page.airingSchedules ? response.Page.airingSchedules : []
            const items: ScheduleItem[] = []

            for (let index = 0; index < schedules.length; index++) {
                const schedule = schedules[index]
                const media = schedule && schedule.media
                if (!media || media.isAdult || media.type !== "ANIME" || media.countryOfOrigin !== "JP" || media.format === "TV_SHORT") {
                    continue
                }

                items.push({
                    id: Number(schedule.id || 0),
                    mediaId: Number(media.id || 0),
                    title: String(media.title && media.title.userPreferred || "Untitled"),
                    image: String(media.coverImage && media.coverImage.large || media.bannerImage || ""),
                    episode: Number(schedule.episode || media.nextAiringEpisode && media.nextAiringEpisode.episode || 1),
                    airingAt: Number(schedule.airingAt || 0),
                })
            }

            return items
        }

        function loadSchedule(force: boolean): CachedSchedule {
            if (force) {
                ctx.cache.remove(CACHE_KEY)
            }

            const cached = ctx.cache.get<CachedSchedule>(CACHE_KEY)
            if (cached) {
                return cached
            }

            const now = Date.now()
            const start = Math.floor((now - 2 * DAY) / 1000)
            const end = Math.floor((now + 14 * DAY) / 1000)
            const firstPage = $anilist.listRecentAnime(1, 50, start, end, true)
            const secondPage = $anilist.listRecentAnime(2, 50, start, end, true)
            const result = {
                items: asScheduleItems(firstPage).concat(asScheduleItems(secondPage)),
                refreshedAt: now,
            }

            ctx.cache.set(CACHE_KEY, result)
            return result
        }

        function renderPage(): string {
            let schedule: CachedSchedule
            try {
                schedule = loadSchedule(false)
            }
            catch (error) {
                return "<!doctype html><html><body><main class=\"error\"><h1>Cached Schedule</h1><p>Could not load the schedule. Use Refresh to try again.</p><button id=\"refresh\">Refresh</button></main><script>document.getElementById('refresh').onclick=function(){window.webview.send('refresh',{})}</script></body></html>"
            }

            const groups: Record<string, ScheduleItem[]> = {}
            for (let index = 0; index < schedule.items.length; index++) {
                const item = schedule.items[index]
                const key = localDayKey(item.airingAt)
                if (!groups[key]) groups[key] = []
                groups[key].push(item)
            }

            const keys = Object.keys(groups).sort()
            let sections = ""
            for (let index = 0; index < keys.length; index++) {
                const items = groups[keys[index]].sort(function(a, b) { return a.airingAt - b.airingAt })
                let cards = ""
                for (let cardIndex = 0; cardIndex < items.length; cardIndex++) {
                    const item = items[cardIndex]
                    const image = item.image
                        ? "<img src=\"" + escapeHtml(item.image) + "\" alt=\"\" loading=\"lazy\">"
                        : "<div class=\"cover-placeholder\">No cover</div>"
                    cards += "<button class=\"card\" data-media-id=\"" + item.mediaId + "\">" + image
                        + "<span class=\"details\"><strong>" + escapeHtml(item.title) + "</strong>"
                        + "<small>Episode " + item.episode + " · " + timeLabel(item.airingAt) + "</small></span></button>"
                }
                sections += "<section><h2>" + dayLabel(items[0].airingAt) + "</h2><div class=\"grid\">" + cards + "</div></section>"
            }

            return "<!doctype html><html><head><meta charset=\"utf-8\"><style>"
                + "*{box-sizing:border-box}body{margin:0;background:transparent;color:#e8e8e8;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{max-width:1400px;margin:0 auto;padding:26px 32px 44px}.header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}.title h1{font-size:1.55rem;margin:0 0 5px}.title p{color:#a5a5a5;margin:0;font-size:.88rem}.refresh{border:1px solid #555;border-radius:8px;background:#252525;color:#f5f5f5;padding:9px 14px;font-weight:600;cursor:pointer}.refresh:hover{background:#333}section{margin:0 0 31px}h2{font-size:1rem;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.card{display:flex;min-height:88px;gap:12px;padding:9px;border:1px solid #333;border-radius:10px;background:#1d1d1d;color:inherit;text-align:left;cursor:pointer}.card:hover{background:#292929;border-color:#555}.card img,.cover-placeholder{width:68px;height:68px;flex:0 0 68px;border-radius:7px;object-fit:cover;background:#303030}.cover-placeholder{display:flex;align-items:center;text-align:center;padding:5px;font-size:.7rem;color:#aaa}.details{display:flex;min-width:0;flex-direction:column;justify-content:center;gap:7px}.details strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}.details small{color:#aaa;font-size:.78rem}.error{padding:32px}.error button{padding:8px 12px}@media(max-width:620px){main{padding:20px 16px}.header{align-items:flex-start;flex-direction:column}.refresh{width:100%}}</style></head><body><main><header class=\"header\"><div class=\"title\"><h1>Cached Discover Schedule</h1><p>Cached for this app session · Last refreshed " + escapeHtml(refreshedLabel(schedule.refreshedAt)) + "</p></div><button class=\"refresh\" id=\"refresh\">↻ Refresh</button></header>"
                + (sections || "<p>No upcoming airing episodes were found.</p>")
                + "</main><script>document.getElementById('refresh').onclick=function(){window.webview.send('refresh',{})};Array.prototype.forEach.call(document.querySelectorAll('[data-media-id]'),function(card){card.onclick=function(){window.webview.send('open-entry',{mediaId:card.getAttribute('data-media-id')})}})</script></body></html>"
        }

        const webview = ctx.newWebview({
            slot: "screen",
            fullWidth: true,
            autoHeight: true,
            sidebar: {
                label: "Cached Schedule",
                icon: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" ry=\"2\"/><line x1=\"16\" x2=\"16\" y1=\"2\" y2=\"6\"/><line x1=\"8\" x2=\"8\" y1=\"2\" y2=\"6\"/><line x1=\"3\" x2=\"21\" y1=\"10\" y2=\"10\"/></svg>",
            },
        })

        webview.setContent(function() { return renderPage() })

        webview.channel.on("refresh", function() {
            try {
                loadSchedule(true)
                webview.update()
                ctx.toast.success("Discover schedule refreshed")
            }
            catch (error) {
                ctx.toast.error("Could not refresh the Discover schedule")
            }
        })

        webview.channel.on("open-entry", function(event: { mediaId?: string }) {
            if (event && event.mediaId) {
                ctx.screen.navigateTo("/entry", { id: String(event.mediaId) })
            }
        })

        // The built-in Discover page has a plugin slot above its tabs. This
        // makes the replacement screen one click away without patching the app.
        const discoverLink = ctx.newWebview({
            slot: "after-discover-screen-header",
            autoHeight: true,
            fullWidth: true,
        })
        discoverLink.setContent(function() {
            return "<style>body{margin:0;font-family:system-ui,sans-serif}.bar{display:flex;justify-content:flex-end;padding:0 16px}.open{border:1px solid #555;border-radius:8px;background:#252525;color:#f5f5f5;padding:8px 12px;font-weight:600;cursor:pointer}.open:hover{background:#333}</style><div class=\"bar\"><button class=\"open\" id=\"open\">Open cached schedule</button></div><script>document.getElementById('open').onclick=function(){window.webview.send('open-cached-schedule',{})}</script>"
        })
        discoverLink.channel.on("open-cached-schedule", function() {
            ctx.screen.navigateTo("/webview", { id: PLUGIN_ID })
        })
    })
}
