import React, { useState } from 'react';
import { authenticate } from "~/shopify.server";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getQRCode, validateQRCode } from "~/models/QRCode.server";
import { useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import {
    Card,
    Bleed,
    Button,
    ChoiceList,
    Divider,
    EmptyState,
    InlineStack,
    InlineError,
    Layout,
    Page,
    Text,
    TextField,
    Thumbnail,
    BlockStack,
    PageActions,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import db from "~/db.server";

type FormState = {
    title: string;
    productId: string;
    productVariantId: string;
    productHandle: string;
    destination: string;
    productTitle?: string;
    productAlt?: string;
    productImage?: string;
};

type ActionData = {
    title?: string;
    productId?: string;
    destination?: string;
    errors?: Record<string, string>;
};

type QRCodeData = {
    id?: number;
    image?: string;
    destinationUrl?: string;
} & FormState;

export const loader: LoaderFunction = async ({ request, params }) => {
    const { admin } = await authenticate.admin(request);

    if (params.id === "new") {
        return json({
            destination: "product",
            title: ""
        });
    }

    return json(await getQRCode(Number(params.id), admin.graphql));
}

export const action: ActionFunction = async ({ request, params }) => {
    const { session } = await authenticate.admin(request);
    const { shop } = session;

    const data: any = {
        ...Object.fromEntries(await request.formData()),
        shop,
    };

    if (data.action === "delete") {
        await db.qRCode.delete({ where: { id: Number(params.id) }});
        return redirect("/app");
    }

    const errors = validateQRCode(data);

    if (errors) {
        return json({ errors }, { status: 422 });
    }

    const qrCode =
        params.id === "new"
            ? await db.qRCode.create({ data })
            : await db.qRCode.update({ where: { id: Number(params.id) }, data });

    return redirect(`/app/qrcodes/${qrCode.id}`);
}

const QRCodeForm = () => {
    const actionData = useActionData<ActionData>();
    const errors = actionData?.errors || {};

    const qrCode = useLoaderData<QRCodeData>();
    const [formState, setFormState] = useState<FormState>(qrCode);
    const [cleanFormState, setCleanFormState] = useState<FormState>(qrCode);
    const isDirty = JSON.stringify(formState) !== JSON.stringify(cleanFormState);

    const nav = useNavigation();
    const isSaving = nav.state === "submitting" && nav.formData?.get("action") !== "delete";
    const isDeleting = nav.state === "submitting" && nav.formData?.get("action") === "delete";

    const navigate = useNavigate();

    const selectProduct = async () => {
        const products = await window.shopify.resourcePicker({
            type: "product",
            action: "select" // customized action verb, either 'select' or 'add',
        });

        if (products) {
            const { images, id, variants, title, handle } = products[0];

            setFormState({
                ...formState,
                productId: id,
                productVariantId: variants[0].id || "",
                productTitle: title,
                productHandle: handle,
                productAlt: images[0]?.altText,
                productImage: images[0]?.originalSrc
            })
        }
    }

    const submit = useSubmit();

    const handleSave = () => {
        const data = {
            title: formState.title,
            productId: formState.productId || "",
            productVariantId: formState.productVariantId || "",
            productHandle: formState.productHandle || "",
            destination: formState.destination,
        };

        setCleanFormState({ ...formState });
        submit(data, { method: "post" });
    }

    return (
        <Page>
            <ui-title-bar title={qrCode.id ? "Edit QR code" : "Create new QR code"}>
                <button variant="breadcrumb" onClick={() => navigate("/app")}>
                    QR codes
                </button>
            </ui-title-bar>
            <Layout>
                <Layout.Section>
                    <BlockStack gap="500">
                        <Card>
                            <BlockStack gap="500">
                                <Text as={"h2"} variant="headingLg">
                                    Title
                                </Text>
                                <TextField
                                    id="title"
                                    helpText="Only store staff can see this title"
                                    label="title"
                                    labelHidden
                                    autoComplete="off"
                                    value={formState.title}
                                    onChange={(title) => setFormState({ ...formState, title })}
                                    error={errors.title}
                                />
                            </BlockStack>
                        </Card>
                        <Card>
                            <BlockStack gap="500">
                                <InlineStack align="space-between">
                                    <Text as={"h2"} variant="headingLg">
                                        Product
                                    </Text>
                                    {formState.productId ? (
                                        <Button variant="plain" onClick={selectProduct}>
                                            Change product
                                        </Button>
                                    ) : null}
                                </InlineStack>
                                {formState.productId ? (
                                    <InlineStack blockAlign="center" gap="500">
                                        <Thumbnail
                                            source={formState.productImage || ImageIcon}
                                            alt={formState.productAlt ?? ""}
                                        />
                                        <Text as="span" variant="headingMd" fontWeight="semibold">
                                            {formState.productTitle}
                                        </Text>
                                    </InlineStack>
                                ) : (
                                    <BlockStack gap="200">
                                        <Button onClick={selectProduct} id="select-product">
                                            Select product
                                        </Button>
                                        {errors.productId ? (
                                            <InlineError
                                                message={errors.productId}
                                                fieldID="myFieldID"
                                            />
                                        ) : null}
                                    </BlockStack>
                                )}
                                <Bleed marginInlineStart="200" marginInlineEnd="200">
                                    <Divider />
                                </Bleed>
                                <InlineStack gap="500" align="space-between" blockAlign="start">
                                    <ChoiceList
                                        title="Scan destination"
                                        choices={[
                                            { label: "Link to product page", value: "product" },
                                            {
                                                label: "Link to checkout page with product in the cart",
                                                value: "cart",
                                            },
                                        ]}
                                        selected={[formState.destination]}
                                        onChange={(destination) =>
                                            setFormState({
                                                ...formState,
                                                destination: destination[0],
                                            })
                                        }
                                        error={errors.destination}
                                    />
                                    {qrCode.destinationUrl ? (
                                        <Button
                                            variant="plain"
                                            url={qrCode.destinationUrl}
                                            target="_blank"
                                        >
                                            Go to destination URL
                                        </Button>
                                    ) : null}
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                    <Card>
                        <Text as={"h2"} variant="headingLg">
                            QR code
                        </Text>
                        {qrCode.image ? (
                            <EmptyState image={qrCode.image} imageContained={true} />
                        ) : (
                            <EmptyState image="">
                                Your QR code will appear here after you save
                            </EmptyState>
                        )}
                        <BlockStack gap="300">
                            <Button
                                disabled={!qrCode?.image}
                                url={qrCode?.image}
                                download
                                variant="primary"
                            >
                                Download
                            </Button>
                            <Button
                                disabled={!qrCode.id}
                                url={`/qrcodes/${qrCode.id}`}
                                target="_blank"
                            >
                                Go to public URL
                            </Button>
                        </BlockStack>
                    </Card>
                </Layout.Section>
                <Layout.Section>
                    <PageActions
                        secondaryActions={[
                            {
                                content: "Delete",
                                loading: isDeleting,
                                disabled: !qrCode.id || !qrCode || isSaving || isDeleting,
                                destructive: true,
                                outline: true,
                                onAction: () =>
                                    submit({ action: "delete" }, { method: "post" }),
                            },
                        ]}
                        primaryAction={{
                            content: "Save",
                            loading: isSaving,
                            disabled: !isDirty || isSaving || isDeleting,
                            onAction: handleSave,
                        }}
                    />
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default QRCodeForm;
