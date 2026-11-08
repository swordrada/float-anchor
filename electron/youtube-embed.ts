import type { Session } from 'electron'
import { YOUTUBE_APP_ORIGIN } from '../src/lib/youtube'

export function configureYouTubeEmbeds(session: Session) {
  // Packaged pages use file://, which cannot supply an HTTP Referer.
  // Identify the installed app for YouTube embeds (otherwise error 153).
  // https://developers.google.com/youtube/terms/required-minimum-functionality
  session.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/embed/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    const hasReferer = Object.keys(headers).some((key) => key.toLowerCase() === 'referer' && headers[key])
    if (details.resourceType === 'subFrame' && details.webContents?.getURL().startsWith('file:') && !hasReferer) {
      headers.Referer = `${YOUTUBE_APP_ORIGIN}/`
    }
    callback({ requestHeaders: headers })
  })
}
