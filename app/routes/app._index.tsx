import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const RAFFLE_DISCOUNT_TITLE = "Raffle Discount";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // First, get the deployed functions to find our raffle discount function ID
  const functionsResponse = await admin.graphql(
    `#graphql
    query GetShopifyFunctions {
      shopifyFunctions(first: 25) {
        nodes {
          id
          title
          apiType
        }
      }
    }`
  );

  const functionsJson = await functionsResponse.json();
  const functions = functionsJson.data?.shopifyFunctions?.nodes || [];

  // Find our raffle discount function by looking for discount functions
  // The function title comes from the locales/en.default.json or extension name
  const raffleFunction = functions.find(
    (fn: { id: string; title: string; apiType: string }) =>
      fn.apiType === "discount" &&
      fn.title.toLowerCase().includes("raffle")
  );

  if (!raffleFunction) {
    console.log(
      "Raffle discount function not found. Make sure the function is deployed. Available functions:",
      functions.map((f: { title: string; apiType: string }) => ({
        title: f.title,
        apiType: f.apiType,
      }))
    );
    return null;
  }

  // Check if the raffle discount is already registered
  const existingDiscountResponse = await admin.graphql(
    `#graphql
    query GetRaffleDiscount {
      automaticDiscountNodes(first: 10, query: "title:Raffle Discount") {
        nodes {
          id
          automaticDiscount {
            ... on DiscountAutomaticApp {
              title
              appDiscountType {
                functionId
              }
            }
          }
        }
      }
    }`
  );

  const existingDiscountJson = await existingDiscountResponse.json();
  const existingDiscounts =
    existingDiscountJson.data?.automaticDiscountNodes?.nodes || [];

  // Check if our function is already registered
  const isAlreadyRegistered = existingDiscounts.some((node: any) => {
    const discount = node.automaticDiscount;
    return (
      discount?.title === RAFFLE_DISCOUNT_TITLE &&
      discount?.appDiscountType?.functionId === raffleFunction.id
    );
  });

  if (!isAlreadyRegistered) {
    // Register the discount function using the actual function ID
    const createDiscountResponse = await admin.graphql(
      `#graphql
      mutation CreateRaffleDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          automaticAppDiscount: {
            title: RAFFLE_DISCOUNT_TITLE,
            functionId: raffleFunction.id,
            discountClasses: ["ORDER"],
            startsAt: new Date().toISOString(),
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: true,
            },
          },
        },
      }
    );

    const createDiscountJson = await createDiscountResponse.json();
    const userErrors =
      createDiscountJson.data?.discountAutomaticAppCreate?.userErrors || [];

    if (userErrors.length > 0) {
      console.error("Failed to register raffle discount:", userErrors);
    } else {
      console.log(
        "Raffle discount registered:",
        createDiscountJson.data?.discountAutomaticAppCreate?.automaticAppDiscount
      );
    }
  }

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson!.data!.productCreate!.product,
    variant:
      variantResponseJson!.data!.productVariantsBulkUpdate!.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Shopify app template">
      <s-button slot="primary-action" onClick={generateProduct}>
        Generate a product
      </s-button>

      <s-section heading="Congrats on creating a new Shopify app 🎉">
        <s-paragraph>
          This embedded app template uses{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>{" "}
          interface examples like an{" "}
          <s-link href="/app/additional">additional page in the app nav</s-link>
          , as well as an{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>{" "}
          mutation demo, to provide a starting point for app development.
        </s-paragraph>
      </s-section>
      <s-section heading="Get started with products">
        <s-paragraph>
          Generate a product with GraphQL and get the JSON output for that
          product. Learn more about the{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
            target="_blank"
          >
            productCreate
          </s-link>{" "}
          mutation in our API references.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            Generate a product
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              Edit product
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading="productCreate mutation">
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>productVariantsBulkUpdate mutation</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading="App template specs">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Interface: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Polaris web components
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            GraphQL
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            Build an{" "}
            <s-link
              href="https://shopify.dev/docs/apps/getting-started/build-app-example"
              target="_blank"
            >
              example app
            </s-link>
          </s-list-item>
          <s-list-item>
            Explore Shopify&apos;s API with{" "}
            <s-link
              href="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
              target="_blank"
            >
              GraphiQL
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
