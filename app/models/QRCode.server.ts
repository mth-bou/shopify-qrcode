import db from "../db.server";
import qrcode from "qrcode";
import invariant from "tiny-invariant";
import type { QRCode as PrismaQRCode } from "@prisma/client";

type SupplementedQRCode = PrismaQRCode & {
    productDeleted: boolean;
    productTitle?: string;
    productImage?: string;
    productAlt?: string;
    destinationUrl: string;
    image: string;
};

interface GraphQLResponse {
    data: {
        product: {
            title?: string;
            images: {
                nodes: Array<{
                    altText?: string;
                    url: string;
                }>;
            };
        };
    };
}

export const getQRCode = async (
    id: number,
    graphql: (query: string, variables: Record<string, any>) => Promise<Response>
): Promise<SupplementedQRCode | null> => {

    const qrCode: PrismaQRCode | null = await db.qRCode.findFirst({ where: { id } });

    if (!qrCode) {
        return null;
    }

    return supplementQRCode(qrCode, graphql);
}

export const getQRCodes = async (
    shop: object,
    graphql: (query: string, variables: Record<string, any>) => Promise<Response>
): Promise<SupplementedQRCode[]> => {

    const qrCodes: PrismaQRCode[] = await db.qRCode.findMany({
        where: { shop },
        orderBy: { id: "desc" }
    });

    if (qrCodes.length === 0) return [];

    return Promise.all(
        qrCodes.map((qrCode) => supplementQRCode(qrCode, graphql))
    )
}

export const getQRCodeImage = (id: number): Promise<string> => {
    const url = new URL(`/qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
    return qrcode.toDataURL(url.href);
}

export const getDestinationUrl = (qrCode: PrismaQRCode): string => {
    if (qrCode.destination === "product") {
        return `https://${qrCode.shop}/products/${qrCode.productHandle}`;
    }

    const match = /gid:\/\/shopify\/ProductVariant\/([0-9]+)/.exec(qrCode.productVariantId);

    invariant(match, "Unrecognized product variant ID");

    return `https://${qrCode.shop}/cart/${match[1]}:1`;
}

/*
 * The QR code from Prisma needs to be supplemented with product data. It also needs the QR code image and destination URL.
 */
const supplementQRCode = async (
    qrCode: PrismaQRCode,
    graphql: (query: string, variables: Record<string, any>) => Promise<Response>
): Promise<SupplementedQRCode> => {

    const qrCodeImagePromise = getQRCodeImage(qrCode.id);

    const response = await graphql(
        `
            query supplementQRCode($id: ID!) {
                product(id: $id) {
                    title
                    images(first: 1) {
                        nodes {
                            altText
                            url
                        }
                    }
                }
            }
        `,
        {
            variables: {
                id: qrCode.productId
            },
        }
    );

    const jsonResponse: GraphQLResponse = await response.json();

    const {
        data: { product },
    } = jsonResponse;

    return {
        ...qrCode,
        productDeleted: !product?.title,
        productTitle: product?.title,
        productImage: product?.images?.nodes[0]?.url,
        productAlt: product?.images?.nodes[0]?.altText,
        destinationUrl: getDestinationUrl(qrCode),
        image: await qrCodeImagePromise,
    }
}

interface QRCodeErrors {
    title?: string;
    productId?: string;
    destination?: string;
}

export const validateQRCode = (data: PrismaQRCode) => {
    const errors: QRCodeErrors = {};

    if (!data.title) errors.title = "Title is required";

    if (!data.productId) errors.productId = "Product is required";

    if (!data.destination) errors.destination = "Destination is required";

    if (Object.keys(errors).length) {
        return errors;
    }
}
