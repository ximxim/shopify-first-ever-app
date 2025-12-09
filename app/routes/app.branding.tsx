import { useState, useEffect, useCallback } from "react";
import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Type definitions
interface ActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

interface GenericFile {
  id: string;
  fileStatus: string;
  url?: string;
}

// Helper function to wait/poll
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResponse> => {
  console.log("[Branding] Starting font upload action...");
  
  try {
    const { admin } = await authenticate.admin(request);
    
    // Parse the multipart form data
    const formData = await request.formData();
    const fontFile = formData.get("fontFile") as File | null;
    
    if (!fontFile || !(fontFile instanceof File)) {
      console.error("[Branding] No font file provided");
      return { success: false, message: "No font file provided", error: "Please upload a font file" };
    }
    
    // Validate file type
    const fileName = fontFile.name.toLowerCase();
    if (!fileName.endsWith(".woff") && !fileName.endsWith(".woff2")) {
      console.error("[Branding] Invalid file type:", fileName);
      return { 
        success: false, 
        message: "Invalid file type", 
        error: "Only .woff and .woff2 files are allowed" 
      };
    }
    
    const mimeType = fileName.endsWith(".woff2") ? "font/woff2" : "font/woff";
    const fileSize = fontFile.size;
    
    console.log(`[Branding] Processing file: ${fontFile.name}, size: ${fileSize}, type: ${mimeType}`);
    
    // Step 1: Create Staged Upload Target
    console.log("[Branding] Step 1: Creating staged upload target...");
    const stagedUploadResponse = await admin.graphql(
      `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: [
            {
              resource: "FILE",
              filename: fontFile.name,
              mimeType: mimeType,
              fileSize: fileSize.toString(),
              httpMethod: "POST",
            },
          ],
        },
      }
    );
    
    const stagedUploadJson = await stagedUploadResponse.json();
    console.log("[Branding] Staged upload response:", JSON.stringify(stagedUploadJson, null, 2));
    
    if (stagedUploadJson.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      const errors = stagedUploadJson.data.stagedUploadsCreate.userErrors;
      console.error("[Branding] Staged upload user errors:", errors);
      return { 
        success: false, 
        message: "Failed to create upload target", 
        error: errors.map((e: { message: string }) => e.message).join(", ") 
      };
    }
    
    const stagedTarget: StagedUploadTarget = stagedUploadJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget) {
      console.error("[Branding] No staged target returned");
      return { success: false, message: "No upload target returned", error: "Failed to get upload URL" };
    }
    
    console.log(`[Branding] Staged upload URL: ${stagedTarget.url}`);
    
    // Step 2: Upload File to Staged URL
    console.log("[Branding] Step 2: Uploading file to staged URL...");
    const uploadFormData = new FormData();
    
    // Add all parameters from staged target
    for (const param of stagedTarget.parameters) {
      uploadFormData.append(param.name, param.value);
    }
    
    // Add the file last
    const fileBuffer = await fontFile.arrayBuffer();
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    uploadFormData.append("file", fileBlob, fontFile.name);
    
    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadFormData,
    });
    
    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();
      console.error("[Branding] Upload failed:", uploadResponse.status, uploadError);
      return { 
        success: false, 
        message: "Failed to upload file", 
        error: `Upload failed with status ${uploadResponse.status}` 
      };
    }
    
    console.log("[Branding] File uploaded successfully");
    
    // Step 3: Create File Asset in Shopify
    console.log("[Branding] Step 3: Creating file asset...");
    const fileCreateResponse = await admin.graphql(
      `#graphql
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on GenericFile {
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          files: [
            {
              originalSource: stagedTarget.resourceUrl,
              filename: fontFile.name,
              contentType: "FILE",
            },
          ],
        },
      }
    );
    
    const fileCreateJson = await fileCreateResponse.json();
    console.log("[Branding] File create response:", JSON.stringify(fileCreateJson, null, 2));
    
    if (fileCreateJson.data?.fileCreate?.userErrors?.length > 0) {
      const errors = fileCreateJson.data.fileCreate.userErrors;
      console.error("[Branding] File create user errors:", errors);
      return { 
        success: false, 
        message: "Failed to create file asset", 
        error: errors.map((e: { message: string }) => e.message).join(", ") 
      };
    }
    
    const createdFile: GenericFile = fileCreateJson.data?.fileCreate?.files?.[0];
    if (!createdFile?.id) {
      console.error("[Branding] No file ID returned");
      return { success: false, message: "No file created", error: "Failed to create file in Shopify" };
    }
    
    console.log(`[Branding] File created with ID: ${createdFile.id}`);
    
    // Step 4: Poll for File Ready
    console.log("[Branding] Step 4: Waiting for file to be ready...");
    let fileReady = false;
    let fileId = createdFile.id;
    let attempts = 0;
    const maxAttempts = 30; // Max 30 seconds
    
    while (!fileReady && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;
      
      const fileStatusResponse = await admin.graphql(
        `#graphql
        query getFile($id: ID!) {
          node(id: $id) {
            ... on GenericFile {
              id
              fileStatus
              url
            }
          }
        }`,
        {
          variables: { id: fileId },
        }
      );
      
      const fileStatusJson = await fileStatusResponse.json();
      const fileNode = fileStatusJson.data?.node;
      
      console.log(`[Branding] File status check ${attempts}: ${fileNode?.fileStatus}`);
      
      if (fileNode?.fileStatus === "READY") {
        fileReady = true;
        console.log("[Branding] File is ready!");
      } else if (fileNode?.fileStatus === "FAILED") {
        console.error("[Branding] File processing failed");
        return { success: false, message: "File processing failed", error: "Shopify could not process the font file" };
      }
    }
    
    if (!fileReady) {
      console.error("[Branding] File processing timeout");
      return { success: false, message: "File processing timeout", error: "File took too long to process" };
    }
    
    // Step 5: Get Active Checkout Profile
    console.log("[Branding] Step 5: Getting active checkout profile...");
    const checkoutProfilesResponse = await admin.graphql(
      `#graphql
      query checkoutProfiles {
        checkoutProfiles(first: 1, query: "is_published:true") {
          edges {
            node {
              id
              name
            }
          }
        }
      }`
    );
    
    const checkoutProfilesJson = await checkoutProfilesResponse.json();
    console.log("[Branding] Checkout profiles response:", JSON.stringify(checkoutProfilesJson, null, 2));
    
    const checkoutProfile = checkoutProfilesJson.data?.checkoutProfiles?.edges?.[0]?.node;
    if (!checkoutProfile?.id) {
      console.error("[Branding] No published checkout profile found");
      return { 
        success: false, 
        message: "No checkout profile found", 
        error: "Could not find a published checkout profile. Make sure you have Shopify Plus." 
      };
    }
    
    console.log(`[Branding] Using checkout profile: ${checkoutProfile.id} (${checkoutProfile.name})`);
    
    // Step 6: Apply Font to Checkout Branding
    console.log("[Branding] Step 6: Applying font to checkout branding...");
    
    // Extract the GenericFile ID (we need to convert from MediaImage/File ID to GenericFile ID format)
    // The fileId should already be in the correct format: gid://shopify/GenericFile/xxx
    const genericFileId = fileId;
    
    const brandingUpsertResponse = await admin.graphql(
      `#graphql
      mutation checkoutBrandingUpsert($checkoutProfileId: ID!, $checkoutBrandingInput: CheckoutBrandingInput!) {
        checkoutBrandingUpsert(checkoutProfileId: $checkoutProfileId, checkoutBrandingInput: $checkoutBrandingInput) {
          checkoutBranding {
            designSystem {
              typography {
                primary {
                  base {
                    sources
                  }
                }
                secondary {
                  base {
                    sources
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          checkoutProfileId: checkoutProfile.id,
          checkoutBrandingInput: {
            designSystem: {
              typography: {
                primary: {
                  customFontGroup: {
                    base: {
                      genericFileId: genericFileId,
                      weight: 400,
                    },
                    bold: {
                      genericFileId: genericFileId,
                      weight: 700,
                    },
                  },
                },
                secondary: {
                  customFontGroup: {
                    base: {
                      genericFileId: genericFileId,
                      weight: 400,
                    },
                    bold: {
                      genericFileId: genericFileId,
                      weight: 700,
                    },
                  },
                },
              },
            },
            customizations: {
              primaryButton: {
                typography: {
                  font: "PRIMARY",
                },
              },
            },
          },
        },
      }
    );
    
    const brandingUpsertJson = await brandingUpsertResponse.json();
    console.log("[Branding] Branding upsert response:", JSON.stringify(brandingUpsertJson, null, 2));
    
    if (brandingUpsertJson.data?.checkoutBrandingUpsert?.userErrors?.length > 0) {
      const errors = brandingUpsertJson.data.checkoutBrandingUpsert.userErrors;
      console.error("[Branding] Branding upsert user errors:", errors);
      return { 
        success: false, 
        message: "Failed to apply font to checkout", 
        error: errors.map((e: { message: string }) => e.message).join(", ") 
      };
    }
    
    console.log("[Branding] Font successfully applied to checkout!");
    
    return { 
      success: true, 
      message: "Font successfully applied to checkout! The new font will now appear on primary text, secondary text, and buttons." 
    };
    
  } catch (error) {
    console.error("[Branding] Unexpected error:", error);
    return { 
      success: false, 
      message: "An unexpected error occurred", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
};

export default function BrandingPage() {
  const fetcher = useFetcher<ActionResponse>();
  const shopify = useAppBridge();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";
  const actionData = fetcher.data;
  
  // Show toast on success/error
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message, { duration: 5000 });
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { duration: 5000, isError: true });
    }
  }, [actionData, shopify]);
  
  const handleDropZoneChange = useCallback((event: Event) => {
    const target = event.target as HTMLInputElement & { files: FileList };
    if (target.files && target.files.length > 0) {
      setSelectedFile(target.files[0]);
    }
  }, []);
  
  const handleSubmit = useCallback(() => {
    if (!selectedFile) {
      shopify.toast.show("Please select a font file first", { isError: true });
      return;
    }
    
    const formData = new FormData();
    formData.append("fontFile", selectedFile);
    
    fetcher.submit(formData, {
      method: "POST",
      encType: "multipart/form-data",
    });
  }, [selectedFile, fetcher, shopify]);

  return (
    <s-page heading="Checkout Branding">
      {actionData && !isLoading && (
        <s-banner
          tone={actionData.success ? "success" : "critical"}
          heading={actionData.success ? "Success" : "Error"}
          dismissible
        >
          {actionData.success ? actionData.message : actionData.error}
        </s-banner>
      )}
      
      <s-section heading="Customize Checkout Font">
        <s-stack direction="block" gap="large">
          <s-paragraph>
            Upload a custom font file to apply to your checkout. The font will be used for 
            primary text (body text, form fields), secondary text (headings), and buttons.
          </s-paragraph>
          
          <s-paragraph color="subdued">
            <s-text type="strong">Requirements:</s-text> Only .woff and .woff2 font files are accepted. 
            Make sure you have the proper license to use the font on your checkout.
          </s-paragraph>
          
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
            borderStyle="dashed"
            borderColor="subdued"
          >
            <s-drop-zone
              accept=".woff,.woff2,font/woff,font/woff2"
              label="Drop your font file here or click to upload"
              name="fontFile"
              onInput={handleDropZoneChange}
            />
          </s-box>
          
          {selectedFile && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-icon type="file" />
                <s-text>Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</s-text>
              </s-stack>
            </s-box>
          )}
          
          <s-button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedFile || isLoading}
            {...(isLoading ? { loading: true } : {})}
          >
            {isLoading ? "Applying Font..." : "Change Checkout Font"}
          </s-button>
        </s-stack>
      </s-section>
      
      <s-section slot="aside" heading="About Checkout Branding">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Custom fonts help create a cohesive brand experience across your storefront and checkout.
          </s-paragraph>
          
          <s-paragraph color="subdued">
            <s-text type="strong">Note:</s-text> Checkout branding is available only for Shopify Plus stores 
            or development stores with the Checkout Extensibility preview enabled.
          </s-paragraph>
          
          <s-divider />
          
          <s-paragraph>
            <s-link
              href="https://shopify.dev/docs/apps/build/checkout/styling/customize-typography"
              target="_blank"
            >
              Learn more about checkout typography
            </s-link>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

