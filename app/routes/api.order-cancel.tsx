import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";

// The loader responds to preflight (OPTIONS) requests from the extension
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.customerAccount(request);
  return new Response(null, { status: 200 });
};

// The action handles the POST request to cancel the order
export const action = async ({ request }: ActionFunctionArgs) => {
  const { cors, sessionToken } = await authenticate.public.customerAccount(
    request
  );

  try {
    // Parse the request body to get the orderId
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return cors(
        new Response(
          JSON.stringify({ errors: [{ message: "orderId is required" }] }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }

    // Get admin API access using the shop from the session token
    const shop = sessionToken.dest.replace("https://", "");
    const { admin } = await unauthenticated.admin(shop);

    // Call the orderCancel mutation
    const response = await admin.graphql(
      `#graphql
      mutation orderCancel($orderId: ID!) {
        orderCancel(
          orderId: $orderId
          reason: CUSTOMER
          restock: true
          refundMethod: { originalPaymentMethodsRefund: true }
        ) {
          job { id }
          orderCancelUserErrors { code field message }
        }
      }`,
      {
        variables: { orderId },
      }
    );

    const data = await response.json();

    // Check for user errors from the mutation
    const userErrors = data.data?.orderCancel?.orderCancelUserErrors;
    if (userErrors && userErrors.length > 0) {
      return cors(
        new Response(JSON.stringify({ errors: userErrors }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    // Return success response
    return cors(
      new Response(
        JSON.stringify({
          success: true,
          jobId: data.data?.orderCancel?.job?.id,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  } catch (error) {
    console.error("Error cancelling order:", error);
    return cors(
      new Response(
        JSON.stringify({
          errors: [{ message: "An error occurred while cancelling the order" }],
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  }
};

