import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Query to get existing web pixel
const GET_WEB_PIXEL_QUERY = `#graphql
  query GetWebPixel {
    webPixel {
      id
      settings
    }
  }
`;

// Mutation to create a web pixel
const CREATE_WEB_PIXEL_MUTATION = `#graphql
  mutation WebPixelCreate($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

// Mutation to update a web pixel
const UPDATE_WEB_PIXEL_MUTATION = `#graphql
  mutation WebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

// Mutation to delete a web pixel
const DELETE_WEB_PIXEL_MUTATION = `#graphql
  mutation WebPixelDelete($id: ID!) {
    webPixelDelete(id: $id) {
      deletedWebPixelId
      userErrors {
        code
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(GET_WEB_PIXEL_QUERY);
    const data = await response.json();

    const webPixel = data.data?.webPixel;

    // If no pixel exists, return null
    if (!webPixel) {
      return { webPixel: null };
    }

    // Parse settings if pixel exists
    let accountID = "";
    if (webPixel.settings) {
      try {
        const settings = JSON.parse(webPixel.settings);
        accountID = settings.accountID || "";
      } catch {
        accountID = "";
      }
    }

    return {
      webPixel: {
        id: webPixel.id,
        accountID,
      },
    };
  } catch (error) {
    // If no web pixel exists for this app, the API throws an error
    // We catch it and return null to indicate no pixel is installed
    console.log("No web pixel found for this app, showing install form");
    return { webPixel: null };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const accountID = formData.get("accountID") as string;
  const pixelId = formData.get("pixelId") as string;

  if (intent === "create") {
    const response = await admin.graphql(CREATE_WEB_PIXEL_MUTATION, {
      variables: {
        webPixel: {
          settings: JSON.stringify({ accountID }),
        },
      },
    });

    const data = await response.json();
    const userErrors = data.data?.webPixelCreate?.userErrors || [];

    if (userErrors.length > 0) {
      return {
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return {
      success: true,
      message: "Web pixel created successfully",
      webPixel: data.data?.webPixelCreate?.webPixel,
    };
  }

  if (intent === "update") {
    const response = await admin.graphql(UPDATE_WEB_PIXEL_MUTATION, {
      variables: {
        id: pixelId,
        webPixel: {
          settings: JSON.stringify({ accountID }),
        },
      },
    });

    const data = await response.json();
    const userErrors = data.data?.webPixelUpdate?.userErrors || [];

    if (userErrors.length > 0) {
      return {
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return {
      success: true,
      message: "Web pixel updated successfully",
      webPixel: data.data?.webPixelUpdate?.webPixel,
    };
  }

  if (intent === "delete") {
    const response = await admin.graphql(DELETE_WEB_PIXEL_MUTATION, {
      variables: {
        id: pixelId,
      },
    });

    const data = await response.json();
    const userErrors = data.data?.webPixelDelete?.userErrors || [];

    if (userErrors.length > 0) {
      return {
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return {
      success: true,
      message: "Web pixel deleted successfully",
      deleted: true,
    };
  }

  return { success: false, error: "Invalid action" };
};

export default function Analytics() {
  const { webPixel } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [accountID, setAccountID] = useState(webPixel?.accountID || "");

  const isLoading = fetcher.state !== "idle";
  const pixelExists = webPixel !== null;

  // Handle fetcher data changes for toast notifications
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Operation successful");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Update local state when loader data changes (after delete)
  useEffect(() => {
    if (fetcher.data?.deleted) {
      setAccountID("");
    }
  }, [fetcher.data]);

  const handleSave = () => {
    if (!accountID.trim()) {
      shopify.toast.show("Account ID is required", { isError: true });
      return;
    }

    fetcher.submit(
      {
        intent: pixelExists ? "update" : "create",
        accountID,
        ...(pixelExists && webPixel?.id ? { pixelId: webPixel.id } : {}),
      },
      { method: "POST" }
    );
  };

  const handleDelete = () => {
    if (!webPixel?.id) return;

    fetcher.submit(
      {
        intent: "delete",
        pixelId: webPixel.id,
      },
      { method: "POST" }
    );
  };

  // Check if pixel was just deleted
  const wasDeleted = fetcher.data?.deleted === true;
  const currentPixelExists = pixelExists && !wasDeleted;

  return (
    <s-page heading="Analytics Pixel Management">
      <s-section heading="Web Pixel Configuration">
        <s-paragraph>
          Configure your web pixel to track customer events on your storefront.
          The pixel will subscribe to all events and log them to the browser
          console with your account ID.
        </s-paragraph>

        <s-stack direction="block" gap="large">
          {!currentPixelExists && (
            <s-banner tone="info">
              No web pixel is currently installed. Enter your Account ID below
              to install the pixel.
            </s-banner>
          )}

          {currentPixelExists && (
            <s-banner tone="success">
              Web pixel is currently active and tracking events.
            </s-banner>
          )}

          <s-text-field
            label="Account ID"
            value={accountID}
            onInput={(e: CustomEvent<{ value: string }>) =>
              setAccountID((e.target as HTMLInputElement).value)
            }
            placeholder="Enter your account ID"
            required
          />

          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              onClick={handleSave}
              {...(isLoading ? { loading: true } : {})}
              disabled={!accountID.trim()}
            >
              {currentPixelExists ? "Update Pixel" : "Install Pixel"}
            </s-button>

            {currentPixelExists && (
              <s-button
                tone="critical"
                onClick={handleDelete}
                {...(isLoading ? { loading: true } : {})}
              >
                Delete Pixel
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="About Web Pixels">
        <s-paragraph>
          Web pixels are JavaScript code snippets that run on your online store
          to collect behavioral data for marketing and analytics.
        </s-paragraph>
        <s-paragraph>
          This pixel subscribes to all customer events including:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Page views</s-list-item>
          <s-list-item>Product views</s-list-item>
          <s-list-item>Add to cart</s-list-item>
          <s-list-item>Checkout events</s-list-item>
          <s-list-item>Purchase completions</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Privacy Settings">
        <s-paragraph>
          This pixel is configured with the following privacy settings:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            <s-text type="strong">Analytics:</s-text> Enabled
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Marketing:</s-text> Enabled
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Preferences:</s-text> Enabled
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Sale of Data:</s-text> Disabled
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

