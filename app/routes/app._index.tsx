import React, { useEffect } from "react";
import type { ActionFunction, ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import { AlertDiamondIcon, ImageIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "~/shopify.server";
import { getQRCodes } from "~/models/QRCode.server";
import type { SupplementedQRCode } from "~/models/QRCode.server";
import {
    Page,
    Layout,
    Text,
    Card,
    Button,
    BlockStack,
    Box,
    List,
    Link,
    InlineStack,
    EmptyState,
    IndexTable,
    Thumbnail,
    Icon,
} from "@shopify/polaris";
import type { JsonifyObject } from "type-fest/source/jsonify";

export const loader: LoaderFunction = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const qrCodes = await getQRCodes(session.shop, admin.graphql);

    return json({
        qrCodes,
    });
};

export const action: ActionFunction = async ({ request }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const color = ["Red", "Orange", "Yellow", "Green"][
        Math.floor(Math.random() * 4)
        ];
    const response = await admin.graphql(
        `#graphql
      mutation populateProduct($input: ProductInput!) {
        productCreate(input: $input) {
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
                input: {
                    title: `${color} Snowboard`,
                },
            },
        },
    );
    const responseJson = await response.json();

    const variantId =
        responseJson.data!.productCreate!.product!.variants.edges[0]!.node!.id!;
    const variantResponse = await admin.graphql(
        `#graphql
      mutation shopifyRemixTemplateUpdateVariant($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
        {
            variables: {
                input: {
                    id: variantId,
                    price: Math.random() * 100,
                },
            },
        },
    );

    const variantResponseJson = await variantResponse.json();

    return json({
        product: responseJson!.data!.productCreate!.product,
        variant: variantResponseJson!.data!.productVariantUpdate!.productVariant,
    });
};

type OnActionType = () => void;

interface EmptyQRCodeStateProps {
    onAction: OnActionType;
}

const EmptyQRCodeState: React.FC<EmptyQRCodeStateProps> = ({ onAction }) => (
    <EmptyState
        heading="Create unique QR codes for your product"
        action={{
            content: "Create QR code",
            onAction,
        }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
        <p>Allow customers to scan codes and buy products using their phones.</p>
    </EmptyState>
);

function truncate(str: string, { length = 25 } = {}): string{
    if (!str) return "";
    if (str.length <= length) return str;
    return str.slice(0, length) + "…";
}

interface QRTableProps {
    qrCodes: SupplementedQRCode[];
}

const QRTable: React.FC<QRTableProps> = ({ qrCodes }) => (
    <IndexTable
        headings={[
            { title: "Thumbnail", hidden: true },
            { title: "Title" },
            { title: "Product" },
            { title: "Date created" },
            { title: "Scans" },
        ]}
        itemCount={qrCodes.length}
        selectable={false}
    >
        {qrCodes.map(qrCode => (
            <QRTableRow key={qrCode.id} qrCode={qrCode}/>
        ))};
    </IndexTable>
);

interface QRTableRowProps {
    qrCode: SupplementedQRCode;
}

const QRTableRow: React.FC<QRTableRowProps> = ({ qrCode }) => (
    <IndexTable.Row id={qrCode.id.toString()} position={qrCode.id}>
        <IndexTable.Cell>
            <Thumbnail
                source={qrCode.productImage || ImageIcon}
                alt={qrCode.title}
                size="small"
            />
        </IndexTable.Cell>
        <IndexTable.Cell>
            <Link url={`qrcodes/${qrCode.id}`}>{truncate(qrCode.title)}</Link>
        </IndexTable.Cell>
        <IndexTable.Cell>
            {qrCode.productDeleted ? (
                <InlineStack align="start" gap="200">
          <span style={{ width: "20px" }}>
            <Icon source={AlertDiamondIcon} tone="critical"/>
          </span>
                    <Text tone="critical" as="span">
                        product has been deleted
                    </Text>
                </InlineStack>
            ) : (
                truncate(qrCode.productTitle ?? "")
            )}
        </IndexTable.Cell>
        <IndexTable.Cell>
            {new Date(qrCode.createdAt).toDateString()}
        </IndexTable.Cell>
        <IndexTable.Cell>{qrCode.scans}</IndexTable.Cell>
    </IndexTable.Row>
);

interface LoaderData {
    qrCodes: JsonifyObject<SupplementedQRCode>[];
}

const deserializeQRCodes = (qrCodes: JsonifyObject<SupplementedQRCode>[]): SupplementedQRCode[] => {
    return qrCodes.map((qrCode) => ({
        ...qrCode,
        createdAt: new Date(qrCode.createdAt),
    }));
}

export default function Index(){
    const nav = useNavigation();
    const navigate = useNavigate();
    const loaderData = useLoaderData<LoaderData>();
    const qrCodes = deserializeQRCodes(loaderData.qrCodes)
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const isLoading =
        ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";
    const productId = actionData?.product?.id.replace(
        "gid://shopify/Product/",
        "",
    );

    useEffect(() => {
        if (productId) {
            shopify.toast.show("Product created");
        }
    }, [productId, shopify]);
    const generateProduct = () => submit({}, { replace: true, method: "POST" });

    return (
        <Page>
            <TitleBar title="Remix app template">
                <button variant="primary" onClick={generateProduct}>
                    Generate a product
                </button>
            </TitleBar>
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="500">
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingMd">
                                        Congrats on creating a new Shopify app 🎉
                                    </Text>
                                    <Text variant="bodyMd" as="p">
                                        This embedded app template uses{" "}
                                        <Link
                                            url="https://shopify.dev/docs/apps/tools/app-bridge"
                                            target="_blank"
                                            removeUnderline
                                        >
                                            App Bridge
                                        </Link>{" "}
                                        interface examples like an{" "}
                                        <Link url="/app/additional" removeUnderline>
                                            additional page in the app nav
                                        </Link>
                                        , as well as an{" "}
                                        <Link
                                            url="https://shopify.dev/docs/api/admin-graphql"
                                            target="_blank"
                                            removeUnderline
                                        >
                                            Admin GraphQL
                                        </Link>{" "}
                                        mutation demo, to provide a starting point for app
                                        development.
                                    </Text>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text as="h3" variant="headingMd">
                                        Get started with products
                                    </Text>
                                    <Text as="p" variant="bodyMd">
                                        Generate a product with GraphQL and get the JSON output for
                                        that product. Learn more about the{" "}
                                        <Link
                                            url="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
                                            target="_blank"
                                            removeUnderline
                                        >
                                            productCreate
                                        </Link>{" "}
                                        mutation in our API references.
                                    </Text>
                                </BlockStack>
                                <InlineStack gap="300">
                                    <Button loading={isLoading} onClick={generateProduct}>
                                        Generate a product
                                    </Button>
                                    {actionData?.product && (
                                        <Button
                                            url={`shopify:admin/products/${productId}`}
                                            target="_blank"
                                            variant="plain"
                                        >
                                            View product
                                        </Button>
                                    )}
                                </InlineStack>
                                {actionData?.product && (
                                    <>
                                        <Text as="h3" variant="headingMd">
                                            {" "}
                                            productCreate mutation
                                        </Text>
                                        <Box
                                            padding="400"
                                            background="bg-surface-active"
                                            borderWidth="025"
                                            borderRadius="200"
                                            borderColor="border"
                                            overflowX="scroll"
                                        >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(actionData.product, null, 2)}
                        </code>
                      </pre>
                                        </Box>
                                        <Text as="h3" variant="headingMd">
                                            {" "}
                                            productVariantUpdate mutation
                                        </Text>
                                        <Box
                                            padding="400"
                                            background="bg-surface-active"
                                            borderWidth="025"
                                            borderRadius="200"
                                            borderColor="border"
                                            overflowX="scroll"
                                        >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(actionData.variant, null, 2)}
                        </code>
                      </pre>
                                        </Box>
                                    </>
                                )}
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                        <BlockStack gap="500">
                            <Card>
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingMd">
                                        App template specs
                                    </Text>
                                    <BlockStack gap="200">
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">
                                                Framework
                                            </Text>
                                            <Link
                                                url="https://remix.run"
                                                target="_blank"
                                                removeUnderline
                                            >
                                                Remix
                                            </Link>
                                        </InlineStack>
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">
                                                Database
                                            </Text>
                                            <Link
                                                url="https://www.prisma.io/"
                                                target="_blank"
                                                removeUnderline
                                            >
                                                Prisma
                                            </Link>
                                        </InlineStack>
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">
                                                Interface
                                            </Text>
                                            <span>
                        <Link
                            url="https://polaris.shopify.com"
                            target="_blank"
                            removeUnderline
                        >
                          Polaris
                        </Link>
                                                {", "}
                                                <Link
                                                    url="https://shopify.dev/docs/apps/tools/app-bridge"
                                                    target="_blank"
                                                    removeUnderline
                                                >
                          App Bridge
                        </Link>
                      </span>
                                        </InlineStack>
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">
                                                API
                                            </Text>
                                            <Link
                                                url="https://shopify.dev/docs/api/admin-graphql"
                                                target="_blank"
                                                removeUnderline
                                            >
                                                GraphQL API
                                            </Link>
                                        </InlineStack>
                                    </BlockStack>
                                </BlockStack>
                            </Card>
                            <Card>
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingMd">
                                        Next steps
                                    </Text>
                                    <List>
                                        <List.Item>
                                            Build an{" "}
                                            <Link
                                                url="https://shopify.dev/docs/apps/getting-started/build-app-example"
                                                target="_blank"
                                                removeUnderline
                                            >
                                                {" "}
                                                example app
                                            </Link>{" "}
                                            to get started
                                        </List.Item>
                                        <List.Item>
                                            Explore Shopify’s API with{" "}
                                            <Link
                                                url="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
                                                target="_blank"
                                                removeUnderline
                                            >
                                                GraphiQL
                                            </Link>
                                        </List.Item>
                                    </List>
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    </Layout.Section>
                </Layout>
            </BlockStack>

            <ui-title-bar title="QR codes">
                <button variant="primary" onClick={() => navigate("/app/qrcodes/new")}>
                    Create QR code
                </button>
            </ui-title-bar>

            <Layout>
                <Layout.Section>
                    <Card padding="0">
                        {qrCodes.length === 0 ? (
                            <EmptyQRCodeState onAction={() => navigate("qrcodes/new")}/>
                        ) : (
                            <QRTable qrCodes={qrCodes}/>
                        )}
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
