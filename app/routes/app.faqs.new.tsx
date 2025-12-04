import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useActionData, useNavigate, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

interface ActionData {
  success?: boolean;
  error?: string;
  faqId?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const question = formData.get("question") as string;
  const answer = formData.get("answer") as string;

  if (!question || !answer) {
    return { success: false, error: "Question and answer are required" };
  }

  try {
    const response = await admin.graphql(
      `#graphql
      mutation CreateFAQ($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          metaobject: {
            type: "shopify--qa-pair",
            fields: [
              { key: "question", value: question },
              { key: "answer", value: answer },
            ],
          },
        },
      }
    );

    const responseJson = await response.json();
    const result = responseJson.data?.metaobjectCreate;

    if (result?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors.map((e: any) => e.message).join(", "),
      };
    }

    if (result?.metaobject?.id) {
      return { success: true, faqId: result.metaobject.id };
    }

    return { success: false, error: "Failed to create FAQ" };
  } catch (error) {
    console.error("Error creating FAQ:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
};

export default function NewFAQ() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("FAQ created successfully");
      navigate("/app/faqs");
    }
  }, [actionData?.success, navigate, shopify]);

  return (
    <s-page heading="Create FAQ">
      <s-button slot="breadcrumb-actions" href="/app/faqs" variant="tertiary">
        ← Back to FAQs
      </s-button>

      <s-section heading="FAQ Details">
        {actionData?.error && (
          <s-banner tone="critical" heading="Error">
            {actionData.error}
          </s-banner>
        )}

        <form method="post">
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
                {...(isSubmitting ? { loading: true } : {})}
                disabled={!question.trim() || !answer.trim()}
              >
                Create FAQ
              </s-button>
              <s-button variant="tertiary" href="/app/faqs">
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </form>
      </s-section>

      <s-section slot="aside" heading="Tips">
        <s-paragraph>
          Write clear, concise questions that customers commonly ask about your
          products.
        </s-paragraph>
        <s-paragraph>
          Answers should be helpful and address the question directly. You can
          include details about shipping, materials, care instructions, etc.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

