/**
 * dsh-deepseek-web, node half.
 *
 * The plugin has no host-side behaviour: it only exists so the Loader has an
 * entry to hang the browser half on. The UI ships through exports["./client"]
 * and is discovered from the package.json dsh.client declaration.
 */
export function apply() {}
