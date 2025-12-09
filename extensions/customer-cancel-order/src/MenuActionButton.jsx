import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export default async () => {
  // Check if order is already cancelled before rendering
  let isCancelled = false;

  try {
    const orderQuery = {
      query: `query Order($orderId: ID!) {
        order(id: $orderId) {
          id
          cancelledAt
        }
      }`,
      variables: { orderId: shopify.orderId },
    };

    const result = await fetch(
      'shopify://customer-account/api/2025-10/graphql.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderQuery),
      }
    );

    const { data } = await result.json();
    isCancelled = data?.order?.cancelledAt != null;
  } catch (error) {
    console.error('Error checking order status:', error);
    // If we can't check, don't show the button to be safe
    isCancelled = true;
  }

  render(<MenuActionButton isCancelled={isCancelled} />, document.body);
};

function MenuActionButton({ isCancelled }) {
  const [isLoading, setIsLoading] = useState(false);

  // Don't render if order is already cancelled
  if (isCancelled) {
    return null;
  }

  const handleCancelOrder = async () => {
    setIsLoading(true);

    try {
      // Get session token for authentication
      const token = await shopify.sessionToken.get();

      // Get the app URL from extension context
      const appUrl = 'https://forests-costs-himself-absence.trycloudflare.com';

      // Call our backend endpoint to cancel the order
      const response = await fetch(`${appUrl}/api/order-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: shopify.orderId,
        }),
      });

      const result = await response.json();

      if (response.ok && !result.errors) {
        shopify.toast.show('Order cancelled successfully');
      } else {
        const errorMessage =
          result.errors?.[0]?.message || 'Failed to cancel order';
        shopify.toast.show(errorMessage);
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      shopify.toast.show('An error occurred while cancelling the order');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <s-button loading={isLoading} onClick={handleCancelOrder}>
      Cancel order
    </s-button>
  );
}

