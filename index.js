/**
 * Host half of the 岁时 (Suishi) bundle.
 *
 * Deliberately inert: the plugin is a browser-side almanac. Its lunar and
 * solar-term tables are generated from the Hong Kong Observatory calendars at
 * build time and embedded in the Client module, so no Host service, route or
 * tool is needed. The empty apply keeps the Loader row valid and lets the
 * bundle appear in the plugin inventory without side effects.
 */
export function apply() {}
