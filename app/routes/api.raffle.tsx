import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Raffle Discount API - App Proxy Endpoint
 * 
 * This endpoint is called from the storefront via the app proxy.
 * It authenticates the request to ensure it's coming from Shopify,
 * then generates a random discount between 5-10%.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the app proxy request
  // This validates that the request is coming from Shopify's storefront
  await authenticate.public.appProxy(request);

  // Generate a random discount between 5 and 10 (inclusive)
  const discount = Math.floor(Math.random() * 6) + 5;

  // Return JSON response
  return new Response(
    JSON.stringify({ discount }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};

