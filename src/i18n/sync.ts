/**
 * Copy for the two-phone session (M5): the join code, the connection and session states, and the request states. Filipino
 * first, then English after " · " (the same convention as the other copy files). Simulated data is labelled elsewhere.
 */
export const SYNC = {
  join: {
    title: 'Sumali sa sesyon ngayong gabi · Join an evening',
    hint: 'Ilagay ang kodigo mula sa dashboard, saka pumili ng tungkulin. · Type the code from the dashboard, then choose your role.',
    placeholder: 'Hal. ABC123 · e.g. ABC123',
    a11y: 'Kodigo ng gabi, anim na letra o numero. Evening code, six letters or digits.',
    badCode: 'Anim na letra o numero ang kodigo · The code has six letters or digits.',
    tooMany: 'Masyadong maraming attempt. Maghintay ng 10 minuto. · Too many tries. Wait 10 minutes.',
  },
  state: {
    connecting: 'Kumokonekta… · Connecting…',
    offline: 'Hindi konektado · Not connected',
    offlineHint:
      'Nananatili sa screen ang huling estado. Maa-update ito kapag bumalik ang koneksyon. · The last state stays on screen. It catches up when the connection returns.',
    ended: 'Tapos na ang sesyong ito · This session ended',
    endedHint: 'Sumali ulit gamit ang bagong kodigo · Join again with the new code.',
    refused: 'Walang sesyon na may ganitong kodigo · No session has that code.',
    stale: 'Matagal nang walang update sa oras mula sa dashboard · The dashboard has not sent the clock for a while.',
    watchOnly:
      'Nanonood ka lang: sumali ka matapos magsimula ang sesyon · You are watching only: you joined after the evening started.',
    clockFromDashboard: 'Galing sa dashboard ang orasan · The clock comes from the dashboard',
  },
  request: {
    sending: 'Ipinapadala… · Sending…',
    unsent: 'Ipapadala kapag may koneksyon · Will be sent when connected',
    rejected: (reason: string) => `Hindi tinanggap: ${reason} · Not accepted: ${reason}`,
    sentToDashboard: 'Ipapadala sa dashboard ang bawat lot. · Each lot is sent to the dashboard.',
  },
  dashboard: {
    codeLabel: 'Kodigo ng gabi · Evening code',
    codeHint: 'I-type ito sa ibang telepono para sumali. · Type this on another phone to join.',
    codeWaiting: 'Kinukuha ang kodigo… · Getting the code…',
    warning: (message: string) => `Hindi naipadala: ${message} · Not sent: ${message}`,
  },
} as const;
