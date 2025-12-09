import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Type for note_attributes from cart/order
interface NoteAttribute {
  name: string;
  value: string;
}

// Type for the orders/create webhook payload
interface OrderCreatePayload {
  id: number;
  admin_graphql_api_id: string;
  note_attributes: NoteAttribute[];
}

/**
 * Converts a date string to ISO 8601 date format (YYYY-MM-DD).
 * Attempts to parse various date formats.
 */
function toISODate(dateString: string): string | null {
  try {
    // Try parsing the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Return in YYYY-MM-DD format
    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/**
 * Gets current date in ISO 8601 format (YYYY-MM-DD)
 */
function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, shop, topic, payload } =
    await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger after an app is uninstalled.
  // If the app is already uninstalled, the session may be undefined.
  if (!session || !admin) {
    console.log("No session or admin context available, skipping metafield update");
    return new Response();
  }

  const orderPayload = payload as OrderCreatePayload;
  const noteAttributes = orderPayload.note_attributes || [];

  // Find the date_of_birth attribute in note_attributes
  const dobAttribute = noteAttributes.find(
    (attr) => attr.name === "date_of_birth"
  );

  if (!dobAttribute || !dobAttribute.value) {
    console.log("No date_of_birth attribute found in note_attributes");
    return new Response();
  }

  // Convert the date value to ISO format
  const dateOfBirth = toISODate(dobAttribute.value);

  if (!dateOfBirth) {
    console.log(`Invalid date format for date_of_birth: ${dobAttribute.value}`);
    return new Response();
  }

  const orderId = orderPayload.admin_graphql_api_id;
  const verifiedAt = getCurrentDate();

  console.log(`Setting metafields for order ${orderId}: date_of_birth=${dateOfBirth}, verified_at=${verifiedAt}`);

  try {
    const response = await admin.graphql(
      `#graphql
      mutation SetOrderMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: orderId,
              namespace: "$app",
              key: "date_of_birth",
              value: dateOfBirth,
              type: "date",
            },
            {
              ownerId: orderId,
              namespace: "$app",
              key: "verified_at",
              value: verifiedAt,
              type: "date",
            },
          ],
        },
      }
    );

    const data = await response.json();

    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error(
        "Error setting metafields:",
        JSON.stringify(data.data.metafieldsSet.userErrors)
      );
    } else {
      console.log(
        `Successfully set metafields for order ${orderId}:`,
        JSON.stringify(data.data?.metafieldsSet?.metafields)
      );
    }
  } catch (error) {
    console.error("Failed to set metafields:", error);
  }

  return new Response();
};

