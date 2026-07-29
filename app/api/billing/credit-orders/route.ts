import { handleCreditOrderPost } from "@/modules/billing-kit/server/credit-order-route"

export const runtime = "nodejs"

export const POST = handleCreditOrderPost
