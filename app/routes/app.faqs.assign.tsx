import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

interface FAQ {
  id: string;
  question: string;
}

interface Product {
  id: string;
  title: string;
  handle: string;
  featuredImage?: { url: string } | null;
  currentFaqs: string[];
}

interface LoaderData {
  faqs: FAQ[];
}

interface ActionData {
  success?: boolean;
  error?: string;
  productsUpdated?: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch all FAQs
  const response = await admin.graphql(
    `#graphql
    query GetAllFAQs {
      metaobjects(type: "shopify--qa-pair", first: 100) {
        nodes {
          id
          question: field(key: "question") {
            value
          }
        }
      }
    }`
  );

  const responseJson = await response.json();
  const faqs: FAQ[] =
    responseJson.data?.metaobjects?.nodes?.map((node: any) => ({
      id: node.id,
      question: node.question?.value || "Untitled FAQ",
    })) || [];

  return { faqs } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const productIds = JSON.parse(formData.get("productIds") as string) as string[];
  const faqIds = JSON.parse(formData.get("faqIds") as string) as string[];

  if (!productIds.length || !faqIds.length) {
    return {
      success: false,
      error: "Please select at least one product and one FAQ",
    };
  }

  try {
    let updatedCount = 0;

    // Update each selected product with the FAQ references
    for (const productId of productIds) {
      const response = await admin.graphql(
        `#graphql
        mutation UpdateProductFAQs($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            input: {
              id: productId,
              metafields: [
                {
                  namespace: "$app",
                  key: "faqs",
                  type: "list.metaobject_reference",
                  value: JSON.stringify(faqIds),
                },
              ],
            },
          },
        }
      );

      const responseJson = await response.json();
      const result = responseJson.data?.productUpdate;

      if (result?.userErrors?.length > 0) {
        console.error("Error updating product:", result.userErrors);
      } else if (result?.product?.id) {
        updatedCount++;
      }
    }

    return {
      success: true,
      productsUpdated: updatedCount,
    };
  } catch (error) {
    console.error("Error assigning FAQs:", error);
    return { success: false, error: "Failed to assign FAQs to products" };
  }
};

export default function AssignFAQs() {
  const { faqs } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [selectedFaqIds, setSelectedFaqIds] = useState<string[]>([]);

  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(
        `FAQs assigned to ${actionData.productsUpdated} product(s)`
      );
      setSelectedProducts([]);
      setSelectedFaqIds([]);
    }
  }, [actionData, shopify]);

  const handleSelectProducts = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    });

    if (selected) {
      const products: Product[] = selected.map((product: any) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        featuredImage: product.images?.[0] || null,
        currentFaqs: [],
      }));
      setSelectedProducts(products);
    }
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleToggleFaq = (faqId: string) => {
    setSelectedFaqIds((prev) =>
      prev.includes(faqId)
        ? prev.filter((id) => id !== faqId)
        : [...prev, faqId]
    );
  };

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("productIds", JSON.stringify(selectedProducts.map((p) => p.id)));
    formData.set("faqIds", JSON.stringify(selectedFaqIds));
    submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Assign FAQs to Products">
      <s-button slot="breadcrumb-actions" href="/app/faqs" variant="tertiary">
        ← Back to FAQs
      </s-button>

      {actionData?.error && (
        <s-banner tone="critical" heading="Error">
          {actionData.error}
        </s-banner>
      )}

      <s-section heading="Step 1: Select Products">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Choose the products you want to assign FAQs to.
          </s-paragraph>

          <s-button onClick={handleSelectProducts} variant="secondary">
            {selectedProducts.length > 0
              ? `Change Products (${selectedProducts.length} selected)`
              : "Select Products"}
          </s-button>

          {selectedProducts.length > 0 && (
            <s-stack direction="block" gap="small">
              {selectedProducts.map((product) => (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base" alignItems="center">
                    {product.featuredImage?.url && (
                      <s-thumbnail
                        src={product.featuredImage.url}
                        alt={product.title}
                        size="small"
                      />
                    )}
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{product.title}</s-text>
                    </s-stack>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => handleRemoveProduct(product.id)}
                    >
                      Remove
                    </s-button>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Step 2: Select FAQs">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Choose the FAQs to assign to the selected products.
          </s-paragraph>

          {faqs.length === 0 ? (
            <s-banner tone="info" heading="No FAQs available">
              <s-link href="/app/faqs/new">Create your first FAQ</s-link> to
              assign it to products.
            </s-banner>
          ) : (
            <s-stack direction="block" gap="small">
              {faqs.map((faq) => (
                <s-box
                  key={faq.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={
                    selectedFaqIds.includes(faq.id) ? "subdued" : "transparent"
                  }
                >
                  <s-checkbox
                    label={faq.question}
                    checked={selectedFaqIds.includes(faq.id)}
                    onChange={() => handleToggleFaq(faq.id)}
                  />
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Step 3: Apply">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            This will assign the selected FAQs to all selected products,
            replacing any existing FAQ assignments.
          </s-paragraph>

          <s-button
            variant="primary"
            onClick={handleSubmit}
            disabled={selectedProducts.length === 0 || selectedFaqIds.length === 0}
            {...(isSubmitting ? { loading: true } : {})}
          >
            Assign FAQs to {selectedProducts.length} Product(s)
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          Select products using the resource picker, then choose which FAQs to
          assign. The FAQs will be stored as a metafield on each product.
        </s-paragraph>
        <s-paragraph>
          Assigned FAQs can be displayed on your storefront using Liquid or the
          Storefront API.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

