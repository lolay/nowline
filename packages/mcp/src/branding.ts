/**
 * Nowline MCP branding icons (MCP spec icons on Implementation / Tool / Prompt).
 *
 * Source assets:
 *   - PNG: branding/marketplace-publisher-icon.png (128x128)
 *   - SVG: branding/favicon.svg
 *
 * Regenerate data URIs after asset changes:
 *   base64 -i branding/marketplace-publisher-icon.png | tr -d '\n'
 *
 * Per-tool / per-prompt icons: add icons: NOWLINE_MCP_ICONS to each registerTool /
 * registerPrompt config once @modelcontextprotocol/sdk exposes icons on those config types
 * (SDK 1.29.0 registerTool config does not include icons yet).
 */
export const NOWLINE_MCP_ICONS = [
    {
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADkklEQVR4nO3cS0ojQBSF4bJpESEZBKHdQLKALCBz3UFm6i4UM8zAYTYg6iw7cAFxF3EDTtqGhLZB0K4bKBqq0EbNo+4555/k1vh8PkbZeo0FRZsAkCcA5AkAeQJAngCQJwDkCQB5AkCeAJAnAOQJAHkCQJ4AkCcA5AkAeQJAngCQJwDkUQJ4nk7D7OZm8WltdzqheXS0+GSLDsDTZBIeB4N4lbWGw7Db68WLJyoAL7NZeOj3w+t8Hl9lW41G2B+Pw7dmM744ogLw3k9/am80Cjvdbrw4ogIwu7oKs+vr8F7N4+PQPDmJF0cCkCUAwAlAmQBkCQBwAlAmAFkCAJwAlAlAlgAAJwBlApAlAMAJQJkAZAkAcAJQJgBZAgCcAJQJQJYAACcAZQKQJQDA/Tw/D3/u7uL1dt/b7fDj8jJeHNEA+H17G35dXMTr/+0eHobW6Wm88KMA8JHxUywI4AF8ZvwUAwJoAF8ZP4WOABbAMsZPISOABLDM8VOoCOAArGL8FCICKACrHD+FhgAGwDrGTyEhgACwzvFTKAjcA9jE+CkEBK4BbHL8lHcEbgHUMH7KMwKXAGoaP+UVgTsANY6f8ojAFYCax095Q+AGgIfxU54QuADgafyUFwTVA/A4fsoDgqoBeB4/VTuCagEgjJ+qGUGVAJDGT9WKQADW1O7BQWidncWrrqoEYCEhqHV8q1oAFgKCmse3qgZgeUZQ+/hW9QAsjwg8jG+5AGB5QuBlfMsNAMsDAk/jW64AWDUj8Da+5Q6AVSMCj+NbLgFYNSHwOr7lFoBVAwLP41uuAVibROB9fMs9AGsTCBDGtyAAWOtEgDK+BQPAWgcCpPEtKADWKhGgjW/BAbBWgQBxfAsSgLVMBKjjW7AArGUgQB7fggZgfQUB+vgWPADrMwgYxrcoAFgfQcAyvkUDwNKXRZdRAdDXxZcJQJYAACcAZQKQJQDACUCZAGQJAHACUCYAWQIAnACUCUCWAAAnAGUCkCUAwAlAmQBkCQBwAlAmAFkCAJwAlAlAlgAA9zSZhMfBIF5vtzcahZ1uN14cUQF4mc3CQ78fXufz+CrbajTC/ngcvjWb8cURFQDrvd8CreEw7PZ68eKJDoD1PJ0u/hd4vr+PrxC22+3F3/7tTie+uKIEoP4lAOQJAHkCQJ4AkCcA5AkAeQJAngCQJwDkCQB5AkCeAJAnAOQJAHkCQJ4AkCcA5AkAeX8BD/cmvdMOoX4AAAAASUVORK5CYII=',
        mimeType: 'image/png',
        sizes: ['128x128'],
    },
    {
        src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiIgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIj4KICA8IS0tIE5vd2xpbmUgc3RhbmRhbG9uZSBtYXJrOiByZWQgbm93LWxpbmUgKyBkaWFtb25kIC0tPgogIDxyZWN0IHg9IjE0LjUiIHk9IjEiIHdpZHRoPSIzIiBoZWlnaHQ9IjMwIiByeD0iMS41IiBmaWxsPSIjZTUzZTNlIi8+CiAgPHBvbHlnb24gcG9pbnRzPSIxNiw3IDI1LDE2IDE2LDI1IDcsMTYiIGZpbGw9IiNlNTNlM2UiLz4KPC9zdmc+Cg==',
        mimeType: 'image/svg+xml',
        sizes: ['any'],
    },
];
