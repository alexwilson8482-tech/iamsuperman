import type { ApiService } from "../types/order";
import type { BackendRunInfo } from "../types/order";

interface CreateOrderPayload {
  name?: string;
  apiUrl: string;
  apiKey: string;
  link: string;
  services: Record<string, unknown>;
}

interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  schedulerOrderId?: string;
  status?: string;
  completedRuns?: number;
  message?: string;
  raw?: unknown;
}

interface OrderControlResult {
  success: boolean;
  status?: "running" | "paused" | "cancelled" | "completed";
  completedRuns?: number;
  runStatuses?: Array<"pending" | "completed" | "cancelled" | "retrying">;
  error?: string;
}

interface FetchOrderRunsResult {
  schedulerOrderId: string;
  runs: BackendRunInfo[];
}

interface OrderStatusResult {
  schedulerOrderId: string;
  name: string;
  link: string;
  status: string;
  totalRuns: number;
  completedRuns: number;
  runStatuses: string[];
  createdAt: string;
  lastUpdatedAt: string;
  runs: Array<{
    id: string;
    label: string;
    quantity: number;
    time: string;
    status: string;
    smmOrderId: string | null;
    executedAt: string | null;
    error: string | null;
  }>;
}

// 🔥 FIX: Single source of truth for backend URL
const BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/$/, "") ||
  "https://iamsuperman-backend.onrender.com";

console.info("[API] Backend URL:", BACKEND_BASE_URL);

interface RawService {
  service?: string | number;
  id?: string | number;
  name?: string;
  type?: string;
  rate?: string | number;
  min?: string | number;
  max?: string | number;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEndpoint(path: string): string {
  return `${BACKEND_BASE_URL}${path}`;
}

export function getBackendUrl(): string {
  return BACKEND_BASE_URL;
}

export async function fetchServices(apiUrl: string, apiKey: string): Promise<ApiService[]> {
  const endpoint = getEndpoint("/api/services");
  console.info("[Fetch Services] Sending request", { endpoint, apiUrl });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiUrl, apiKey }),
    });
  } catch (error) {
    console.error("[Fetch Services] Network request failed", error);
    throw new Error("Cannot reach backend /api/services. Check backend availability and VITE_BACKEND_URL.");
  }

  const responseText = await response.text();
  const payload = ((): unknown => {
    try { return JSON.parse(responseText); } catch { return null; }
  })();

  const payloadObject = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (!response.ok) {
    console.error("[Fetch Services] Failed response", { status: response.status, payload });
    throw new Error(String(payloadObject?.error || `Failed to fetch services (HTTP ${response.status})`));
  }

  const directRows = Array.isArray(payload) ? payload : [];
  const wrappedServices = payloadObject?.services;
  const rows: RawService[] = Array.isArray(wrappedServices)
    ? (wrappedServices as RawService[])
    : wrappedServices && typeof wrappedServices === "object" && Array.isArray((wrappedServices as { data?: unknown[] }).data)
      ? (wrappedServices as { data: RawService[] }).data
      : (directRows as RawService[]);

  console.info("[Fetch Services] Response received", { count: rows.length });

  return rows
    .map((service) => {
      const id = String(service.service ?? service.id ?? "").trim();
      const name = String(service.name ?? "").trim();
      if (!id || !name) return null;

      return {
        id,
        name,
        type: String(service.type ?? "").trim(),
        rate: String(service.rate ?? "").trim(),
        min: toNumber(service.min),
        max: toNumber(service.max),
      } satisfies ApiService;
    })
    .filter((service): service is ApiService => Boolean(service));
}

export async function createSmmOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  const endpoint = getEndpoint("/api/order");
  console.info("[Create Order] Sending request", {
    endpoint,
    apiUrl: payload.apiUrl,
    services: Object.keys(payload.services),
    link: payload.link,
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[Create Order] Network request failed", error);
    throw new Error("Cannot reach backend /api/order. Check backend availability.");
  }

  const responseText = await response.text();
  const parsed = ((): unknown => {
    try { return JSON.parse(responseText); } catch { return null; }
  })();

  const payloadObject = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const explicitError =
    typeof payloadObject?.error === "string" && payloadObject.error.trim()
      ? payloadObject.error.trim()
      : "";
  const isExplicitSuccess = payloadObject?.success === true;
  const successMessage =
    typeof payloadObject?.message === "string" && payloadObject.message.trim()
      ? payloadObject.message.trim()
      : "Order Scheduled Successfully";
  const orderIds = Array.isArray(payloadObject?.orderIds) ? payloadObject.orderIds : null;
  const resolvedOrderId = payloadObject?.orderId ?? payloadObject?.order ?? (orderIds && orderIds[0]);
  const schedulerOrderId =
    payloadObject?.schedulerOrderId !== undefined && payloadObject?.schedulerOrderId !== null
      ? String(payloadObject.schedulerOrderId)
      : undefined;

  if (explicitError) {
    console.error("[Create Order] API returned error", { status: response.status, payload: payloadObject });
    throw new Error(explicitError);
  }

  if (!response.ok) {
    console.error("[Create Order] Failed response", { status: response.status });
    throw new Error(`Order request failed (HTTP ${response.status})`);
  }

  if (isExplicitSuccess) {
    return {
      success: true,
      orderId: resolvedOrderId !== undefined && resolvedOrderId !== null && String(resolvedOrderId).trim() !== ""
        ? String(resolvedOrderId) : undefined,
      message: successMessage,
      schedulerOrderId,
      status: typeof payloadObject?.status === "string" ? payloadObject.status : undefined,
      completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
      raw: payloadObject,
    };
  }

  if (resolvedOrderId === undefined || resolvedOrderId === null || String(resolvedOrderId).trim() === "") {
    throw new Error("Order failed: provider did not return an order ID or success confirmation");
  }

  return {
    success: true,
    orderId: String(resolvedOrderId),
    message: successMessage,
    schedulerOrderId,
    status: typeof payloadObject?.status === "string" ? payloadObject.status : undefined,
    completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
    raw: payloadObject,
  };
}

export async function updateOrderControl(payload: {
  schedulerOrderId: string;
  action: "pause" | "resume" | "cancel";
}): Promise<OrderControlResult> {
  const endpoint = getEndpoint("/api/order/control");

  const maxRetries = payload.action === "cancel" ? 3 : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(responseText); } catch { parsed = null; }

      const payloadObject = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

      if (!response.ok || payloadObject?.success === false) {
        const errorMsg = String(payloadObject?.error || `Order control failed (HTTP ${response.status})`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw new Error(errorMsg);
      }

      return {
        success: true,
        status:
          payloadObject?.status === "running" ||
          payloadObject?.status === "paused" ||
          payloadObject?.status === "cancelled" ||
          payloadObject?.status === "completed"
            ? payloadObject.status
            : undefined,
        completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
        runStatuses: Array.isArray(payloadObject?.runStatuses)
          ? (payloadObject.runStatuses as Array<"pending" | "completed" | "cancelled" | "retrying">)
          : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError || new Error("Order control failed after all retries");
}

export async function fetchOrderRuns(schedulerOrderId: string): Promise<FetchOrderRunsResult> {
  const endpoint = getEndpoint(`/api/order/runs/${schedulerOrderId}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch runs (HTTP ${response.status})`);
    }

    const data = await response.json();

    return {
      schedulerOrderId: data.schedulerOrderId,
      runs: Array.isArray(data.runs) ? data.runs : [],
    };
  } catch (error) {
    console.error(`[Fetch Order Runs] Error for ${schedulerOrderId}:`, error);
    throw error;
  }
}

export async function fetchOrderStatus(schedulerOrderId: string): Promise<OrderStatusResult> {
  const endpoint = getEndpoint(`/api/order/status/${schedulerOrderId}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch order status (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Fetch Order Status] Error for ${schedulerOrderId}:`, error);
    throw error;
  }
}

export async function fetchAllOrdersStatus(): Promise<{
  total: number;
  orders: Array<OrderStatusResult & { runs: Array<{ id: string; label: string; quantity: number; time: string; status: string; smmOrderId: string | null }> }>;
}> {
  const endpoint = getEndpoint("/api/orders/status");

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders status (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Fetch All Orders Status] Error:`, error);
    throw error;
  }
}

export async function fetchMinViewsSetting(): Promise<number> {
  const endpoint = getEndpoint("/api/settings/min-views");

  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    return data.minViewsPerRun || 100;
  } catch {
    console.warn("[Fetch Min Views] Failed, using default 100");
    return 100;
  }
}

export async function updateMinViewsSetting(minViewsPerRun: number): Promise<{ success: boolean; minViewsPerRun: number }> {
  const endpoint = getEndpoint("/api/settings/min-views");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minViewsPerRun }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update min views (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Update Min Views] Error:`, error);
    throw error;
  }
}

export async function cancelMultipleOrders(schedulerOrderIds: string[]): Promise<{
  success: boolean;
  results: Array<{ schedulerOrderId: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ schedulerOrderId: string; success: boolean; error?: string }> = [];

  for (const schedulerOrderId of schedulerOrderIds) {
    try {
      await updateOrderControl({ schedulerOrderId, action: "cancel" });
      results.push({ schedulerOrderId, success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ schedulerOrderId, success: false, error: errorMsg });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return { success: successCount === schedulerOrderIds.length, results };
}
