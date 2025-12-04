import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

interface FAQ {
  id: string;
  handle: string;
  question: string;
  answer: string;
}

interface LoaderData {
  faq: FAQ | null;
  error?: string;
}

interface ActionData {
  success?: boolean;
  error?: string;
  action?: "update" | "delete";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const faqId = params.id;

  if (!faqId) {
    return { faq: null, error: "FAQ ID is required" };
  }

  try {
    const response = await admin.graphql(
      `#graphql
      query GetFAQ($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          question: field(key: "question") {
            value
          }
          answer: field(key: "answer") {
            value
          }
        }
      }`,
      {
        variables: { id: faqId },
      },
    );

    const responseJson = await response.json();
    const metaobject = responseJson.data?.metaobject;

    if (!metaobject) {
      return { faq: null, error: "FAQ not found" };
    }

    return {
      faq: {
        id: metaobject.id,
        handle: metaobject.handle,
        question: metaobject.question?.value || "",
        answer: metaobject.answer?.value || "",
      },
    } satisfies LoaderData;
  } catch (error) {
    console.error("Error loading FAQ:", error);
    return { faq: null, error: "Failed to load FAQ" };
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const faqId = params.id;

  if (!faqId) {
    return { success: false, error: "FAQ ID is required" };
  }

  if (intent === "delete") {
    try {
      const response = await admin.graphql(
        `#graphql
        mutation DeleteFAQ($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: { id: faqId },
        },
      );

      const responseJson = await response.json();
      const result = responseJson.data?.metaobjectDelete;

      if (result?.userErrors?.length > 0) {
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
          action: "delete" as const,
        };
      }

      return { success: true, action: "delete" as const };
    } catch (error) {
      console.error("Error deleting FAQ:", error);
      return {
        success: false,
        error: "Failed to delete FAQ",
        action: "delete" as const,
      };
    }
  }

  // Update FAQ
  const question = formData.get("question") as string;
  const answer = formData.get("answer") as string;

  if (!question || !answer) {
    return {
      success: false,
      error: "Question and answer are required",
      action: "update" as const,
    };
  }

  try {
    const response = await admin.graphql(
      `#graphql
      mutation UpdateFAQ($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
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
          id: faqId,
          metaobject: {
            fields: [
              { key: "question", value: question },
              { key: "answer", value: answer },
            ],
          },
        },
      },
    );

    const responseJson = await response.json();
    const result = responseJson.data?.metaobjectUpdate;

    if (result?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors.map((e: any) => e.message).join(", "),
        action: "update" as const,
      };
    }

    return { success: true, action: "update" as const };
  } catch (error) {
    console.error("Error updating FAQ:", error);
    return {
      success: false,
      error: "Failed to update FAQ",
      action: "update" as const,
    };
  }
};

export default function EditFAQ() {
  const { faq, error: loadError } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const deleteFetcher = useFetcher<ActionData>();

  const [question, setQuestion] = useState(faq?.question || "");
  const [answer, setAnswer] = useState(faq?.answer || "");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isSubmitting = navigation.state === "submitting";
  const isDeleting = deleteFetcher.state === "submitting";
  const isUpdating =
    isSubmitting && navigation.formData?.get("intent") !== "delete";

  useEffect(() => {
    if (actionData?.success) {
      if (actionData.action === "delete") {
        shopify.toast.show("FAQ deleted successfully");
        navigate("/app/faqs");
      } else {
        shopify.toast.show("FAQ updated successfully");
      }
    }
  }, [actionData, navigate, shopify]);

  // Handle delete fetcher response
  useEffect(() => {
    if (
      deleteFetcher.data?.success &&
      deleteFetcher.data?.action === "delete"
    ) {
      shopify.toast.show("FAQ deleted successfully");
      navigate("/app/faqs");
    }
  }, [deleteFetcher.data, navigate, shopify]);

  const handleDelete = () => {
    deleteFetcher.submit({ intent: "delete" }, { method: "post" });
  };

  useEffect(() => {
    if (faq) {
      setQuestion(faq.question);
      setAnswer(faq.answer);
    }
  }, [faq]);

  if (loadError || !faq) {
    return (
      <s-page heading="FAQ Not Found">
        <s-button slot="breadcrumb-actions" href="/app/faqs" variant="tertiary">
          ← Back to FAQs
        </s-button>
        <s-section>
          <s-banner tone="critical" heading="Error">
            {loadError || "FAQ not found"}
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Edit FAQ">
      <s-button slot="breadcrumb-actions" href="/app/faqs" variant="tertiary">
        ← Back to FAQs
      </s-button>

      <s-section heading="FAQ Details">
        {(actionData?.error || deleteFetcher.data?.error) && (
          <s-banner tone="critical" heading="Error">
            {actionData?.error || deleteFetcher.data?.error}
          </s-banner>
        )}

        <form method="post">
          <input type="hidden" name="intent" value="update" />
          <s-stack direction="block" gap="large">
            <s-text-field
              label="Question"
              name="question"
              value={question}
              onInput={(e: any) => setQuestion(e.target.value)}
              placeholder="Enter the frequently asked question"
              required
            />

            <s-text-area
              label="Answer"
              name="answer"
              value={answer}
              onInput={(e: any) => setAnswer(e.target.value)}
              placeholder="Enter the answer to this question"
              rows={5}
              required
            />

            <s-stack direction="inline" gap="base">
              <s-button
                type="submit"
                variant="primary"
                {...(isUpdating ? { loading: true } : {})}
                disabled={!question.trim() || !answer.trim()}
              >
                Save Changes
              </s-button>
              <s-button variant="tertiary" href="/app/faqs">
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </form>
      </s-section>

      <s-section slot="aside" heading="Danger Zone">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Deleting this FAQ will remove it from all products it's assigned to.
          </s-paragraph>
          <s-button
            tone="critical"
            variant="secondary"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete FAQ
          </s-button>
        </s-stack>
      </s-section>

      {showDeleteModal && (
        <s-modal heading="Delete FAQ?" onHide={() => setShowDeleteModal(false)}>
          <s-paragraph>
            Are you sure you want to delete this FAQ? This action cannot be
            undone and will remove the FAQ from all products it's assigned to.
          </s-paragraph>
          <s-button
            slot="primary-action"
            tone="critical"
            variant="primary"
            onClick={handleDelete}
            {...(isDeleting ? { loading: true } : {})}
          >
            Delete FAQ
          </s-button>
          <s-button
            slot="secondary-actions"
            variant="secondary"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </s-button>
        </s-modal>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
