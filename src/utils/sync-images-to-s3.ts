import type { PrintifyImage } from "../modules/printify/api-client"

export type PrintifyImageMapping = {
  printify_src: string
  s3_url: string | null
  s3_file_key: string | null
  synced_at: string | null
}

/**
 * Syncs a single product's Printify images to S3.
 *
 * - Skips images that already have a valid S3 mapping
 * - Uploads new/changed images via the file module
 * - Cleans up orphaned S3 files when Printify removes an image
 * - Each image is independently try/caught so one failure doesn't block others
 */
export async function syncProductImagesToS3(
  printifyImages: PrintifyImage[],
  existingMappings: PrintifyImageMapping[] | null,
  fileModuleService: {
    createFiles: (data: { files: { filename: string; mimeType: string; content: string; access: string }[] }) => Promise<{ id: string; url: string }[]>
    deleteFiles: (ids: string[]) => Promise<void>
  },
  productIdentifier: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Promise<PrintifyImageMapping[]> {
  const currentSrcs = new Set(printifyImages.map((img) => img.src))
  const existingMap = new Map<string, PrintifyImageMapping>()
  for (const m of existingMappings ?? []) {
    existingMap.set(m.printify_src, m)
  }

  // Clean up orphaned S3 files (images removed from Printify)
  const orphanKeys: string[] = []
  for (const m of existingMappings ?? []) {
    if (!currentSrcs.has(m.printify_src) && m.s3_file_key) {
      orphanKeys.push(m.s3_file_key)
    }
  }
  if (orphanKeys.length > 0) {
    try {
      await fileModuleService.deleteFiles(orphanKeys)
      logger.info(`[printify-s3] Cleaned up ${orphanKeys.length} orphaned S3 files for product ${productIdentifier}`)
    } catch (err) {
      logger.warn(`[printify-s3] Failed to clean orphaned S3 files for ${productIdentifier}: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Sync each current image
  const mappings: PrintifyImageMapping[] = []

  for (const img of printifyImages) {
    const existing = existingMap.get(img.src)

    // Already synced — keep existing mapping
    if (existing?.s3_url) {
      mappings.push(existing)
      continue
    }

    // New or previously failed — download and upload
    try {
      const response = await fetch(img.src)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${img.src}`)
      }

      const contentType = response.headers.get("content-type") || "image/jpeg"
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")

      // Extract extension from URL or content-type
      const urlPath = new URL(img.src).pathname
      const ext = urlPath.includes(".") ? urlPath.split(".").pop()! : contentType.split("/")[1] || "jpg"
      const filename = `printify-${productIdentifier}-${img.position}.${ext}`

      const [uploaded] = await fileModuleService.createFiles({
        files: [
          {
            filename,
            mimeType: contentType,
            content: base64,
            access: "public",
          },
        ],
      })

      mappings.push({
        printify_src: img.src,
        s3_url: uploaded.url,
        s3_file_key: uploaded.id,
        synced_at: new Date().toISOString(),
      })

      logger.info(`[printify-s3] Uploaded image ${img.position} for product ${productIdentifier}`)
    } catch (err) {
      logger.warn(
        `[printify-s3] Failed to sync image ${img.position} for product ${productIdentifier}: ${
          err instanceof Error ? err.message : err
        } — will use Printify CDN URL`
      )
      mappings.push({
        printify_src: img.src,
        s3_url: null,
        s3_file_key: null,
        synced_at: null,
      })
    }
  }

  return mappings
}

/**
 * Resolves image URLs: uses S3 URL when available, falls back to Printify CDN.
 * Used in createMedusaProductsStep to build the `images` array.
 */
export function resolveImageUrls(
  printifyImages: PrintifyImage[],
  imageMappings: PrintifyImageMapping[] | null
): { url: string }[] {
  if (!imageMappings || imageMappings.length === 0) {
    return printifyImages.map((img) => ({ url: img.src }))
  }

  const s3Map = new Map<string, string>()
  for (const m of imageMappings) {
    if (m.s3_url) {
      s3Map.set(m.printify_src, m.s3_url)
    }
  }

  return printifyImages.map((img) => ({
    url: s3Map.get(img.src) ?? img.src,
  }))
}

/**
 * Resolves a single Printify CDN URL to its S3 equivalent.
 * Used to translate variantImageMap entries so URL matching works
 * against the S3-based Medusa product images.
 */
export function resolveSingleUrl(
  printifySrc: string,
  imageMappings: PrintifyImageMapping[] | null
): string {
  if (!imageMappings) return printifySrc
  for (const m of imageMappings) {
    if (m.printify_src === printifySrc && m.s3_url) {
      return m.s3_url
    }
  }
  return printifySrc
}
