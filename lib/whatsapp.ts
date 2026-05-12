// Wati API — WhatsApp Business Platform
// Docs: https://docs.wati.io/reference/post_api-v1-sendtemplatemessage

export async function sendWhatsAppTemplate(
  to: string, // E.164 format
  templateName: string,
  params: Array<{ name: string; value: string }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const BASE_URL = process.env.WATI_API_ENDPOINT?.replace(/\/$/, ""); 
    const TOKEN = process.env.WATI_API_TOKEN;

    if (!BASE_URL || !TOKEN) {
      return { success: false, error: "WATI credentials not found in environment." };
    }

    const endpoint = `${BASE_URL}/api/v1/sendTemplateMessage?whatsappNumber=${to}`;

    const body = {
      template_name: templateName,
      broadcast_name: templateName,
      parameters: params,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: TOKEN.startsWith('Bearer') ? TOKEN : `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.result === false) {
      console.error("WATI full response:", JSON.stringify(data));
      return { success: false, error: data?.info ?? data?.message ?? `WATI API error: ${JSON.stringify(data)}` };
    }

    console.log("WATI success response:", JSON.stringify(data));
    return { success: true, messageId: data?.messageId ?? data?.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function sendWhatsAppImage(
  to: string, // E.164 format
  imageUrl: string,
  caption: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const BASE_URL = process.env.WATI_API_ENDPOINT?.replace(/\/$/, ""); 
    const TOKEN = process.env.WATI_API_TOKEN;

    if (!BASE_URL || !TOKEN) {
      return { success: false, error: "WATI credentials not found in environment." };
    }

    const endpoint = `${BASE_URL}/api/v1/sendSessionFile/${to}`;

    // Wati uses FormData for file uploads, this requires URL conversion or base64
    // Note: This is vastly different from Meta. For simple image sending, Wati requires media file fetching
    // Assuming Wati v1 Session Message with media
    
    return { success: false, error: "sendWhatsAppImage needs refactoring for Wati file form upload" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
