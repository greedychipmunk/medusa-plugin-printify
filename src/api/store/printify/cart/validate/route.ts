import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"
import { ErrorCode } from "../../../../../modules/printify/utils/error-handling"

const apiLogger = logger.child("StoreCartValidateAPI")

const validateCartSchema = z.object({
  items: z.array(
    z.object({
      printify_product_id: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).min(1),
})

interface CartValidationItem {
  printify_product_id: string
  quantity: number
  valid: boolean
  product_title?: string
  error?: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const bodyValidation = validateCartSchema.safeParse(req.body)
    if (!bodyValidation.success) {
      res.status(400).json({
        valid: false,
        items: [],
        errors: bodyValidation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      })
      return
    }

    const { items } = bodyValidation.data
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const validatedItems: CartValidationItem[] = []
    const errors: Array<{ printify_product_id: string; message: string }> = []

    for (const item of items) {
      try {
        const [product] = await printifyService.listPrintifyProducts({
          filters: { printify_product_id: item.printify_product_id },
        })

        if (!product) {
          validatedItems.push({
            printify_product_id: item.printify_product_id,
            quantity: item.quantity,
            valid: false,
            error: "Product not found",
          })
          errors.push({
            printify_product_id: item.printify_product_id,
            message: "Product not found",
          })
          continue
        }

        if (!product.enabled) {
          validatedItems.push({
            printify_product_id: item.printify_product_id,
            quantity: item.quantity,
            valid: false,
            product_title: product.title,
            error: "Product is not available",
          })
          errors.push({
            printify_product_id: item.printify_product_id,
            message: "Product is not available",
          })
          continue
        }

        validatedItems.push({
          printify_product_id: item.printify_product_id,
          quantity: item.quantity,
          valid: true,
          product_title: product.title,
        })
      } catch (error) {
        validatedItems.push({
          printify_product_id: item.printify_product_id,
          quantity: item.quantity,
          valid: false,
          error: "Validation failed",
        })
        errors.push({
          printify_product_id: item.printify_product_id,
          message: "Validation failed",
        })
      }
    }

    const allValid = validatedItems.every((item) => item.valid)

    res.json({
      valid: allValid,
      items: validatedItems,
      errors,
    })
  } catch (error) {
    apiLogger.error("Cart validation failed", error as Error)
    res.status(500).json({
      valid: false,
      items: [],
      errors: [{
        message: "Cart validation failed due to an internal error",
      }],
    })
  }
}
