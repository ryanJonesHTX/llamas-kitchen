import { z } from 'zod'

// The recipe page links to sourceUrl, so only http and https are allowed
// (no javascript:, data: and the like). Shared by the input schema and the model.
export const sourceUrlSchema = z.url({ protocol: /^https?$/ })
