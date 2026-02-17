# Klarna Network x Paytrail – Technical documentation

You can check the original version of this document, as shared by the Paytrail team, in the Paytrail demo store: [https://klarna-network-paytrail.vercel.app/documentation#/](https://klarna-network-paytrail.vercel.app/documentation#/)

The version below is currently being edited for a final review.

---

## Prerequisites

Before we start, for a wider overview on how to optimize your integration and increase your sales, please refer to Klarna's dedicated Paytrail documentation.

1. **Activate Klarna:** Before proceeding with Klarna integration, make sure you have Klarna enabled as a payment method in the Paytrail Merchant Panel under Payment Methods page.

2. **Klarna Partner Portal Access:** When you enable Klarna, the admin user assigned to the Klarna payment method in the Paytrail Merchant Panel will also receive an invitation to Klarna's Partner Portal. See details in the [Portal Access](#portal-access) section below.

3. **Payments:** You can offer Klarna in your payment flow in two ways:
   - **Standard Integration:** Offer Klarna with your existing integration, either through the hosted payment page or webshop-rendered payment buttons. See the [Payments](#payments) section below for more details.
   - **Conversion Boosters:** Additionally, you can implement Klarna's Conversion Boosters to increase your conversion rate. See the [Conversion boosters](#conversion-boosters) section below for more details.

4. **Presenting Klarna:** Make sure to review the different ways to present Klarna in your checkout so you can choose the option that best suits both your needs and your customers' needs. See [Presenting Klarna](#presenting-klarna) section below for more details.

---

## Payments

The standard Klarna integration doesn't require any Klarna-specific API calls.

- Payments are created using the normal Create payment API.
- Klarna is shown either on the Paytrail hosted payment page or as a selectable payment method when rendering payment buttons in your store.
- The Klarna payment option is returned as part of the standard payment method response in the credit PaymentMethodGroup.

Klarna also supports **manual invoice activation (capture)**; see [Invoices](/README#invoices) in the main API docs.

For payment reference and examples, see:

- [Create](/README#create)
- [List providers](/README#list-providers)

---

## Presenting Klarna

Integrate Klarna into your checkout by following Klarna's branding and messaging guidelines to optimize the customer journey and maximize conversions.

Refer to the Klarna documentation for:

- Presenting Klarna in your checkout
- Checkout form overview
- Implementing Klarna's Web SDK

---

## Customer Data and Supplementary Purchase Data

It's highly recommended to share as much payment information as possible when using Klarna. This improves session continuity, personalization, and conversion rates, speeds up customer authentication, ensures consistent information across touchpoints, and supports reconciliation and dispute management.

- Customer first and last name
- Email address
- Reference
- Order line items
- Invoicing address
- Delivery address
- Klarna Network Session Token
- Klarna Network Data

Providing complete and correct data improves acceptance rates for Klarna. For more information, check Klarna's documentation for:

- Perfect Customer Journey
- Optimize Conversion Rate
- Integration Checklist

---

## Portal Access

When you enable Klarna, the admin user assigned to the Klarna payment method in the Paytrail Merchant Panel will also receive an invitation to Klarna's Partner Portal. With this access, you will be able to:

- Handle dispute cases and manage dispute settings
- Handle API credentials for Klarna's Conversion Boosters and implement them
- Invite other users to Klarna Partner Portal
- Manage branding assets like logo and social media links

Check Klarna Docs for more information.

---

## Conversion boosters

You can optionally use Klarna's Conversion Boosters with your payments. These features should be implemented directly on your online store using the guidelines provided in Klarna Docs and the Klarna Partner Portal:

- Klarna Express Checkout
- On-site Messaging
- Sign in with Klarna

When your customers interact with Klarna's Conversion Boosters, Klarna's Web SDK will return a **Klarna Network Session Token** that needs to be shared with the Paytrail Payment API when creating the payment session.

To do so, include Klarna provider details in the payment request `providerDetails` object. Sharing the `klarna.networkSessionToken` is required with the Conversion Boosters.

Using Klarna Conversion Boosters requires you to obtain and handle `klarna.networkSessionToken` on your own. Paytrail only provides a way to pass it along with your payments.

You can also send `klarna.networkData` under the `providerDetails` object as a serialized JSON. This enriched data can help increase approval rates and reduce false declines, boosting your sales by enabling Klarna to make smarter decisions.

Example:

```json
{
  "stamp": "29858472953",
  "reference": "9187445",
  "amount": 1590,
  "...",
  "providerDetails": {
    "klarna": {
      "networkSessionToken": "",
      "networkData": ""
    }
  }
}
```

### Klarna provider details

| Field               | Type   | Required | Example / constraints      | Description                                                                 |
| ------------------- | ------ | -------- | -------------------------- | --------------------------------------------------------------------------- |
| networkSessionToken | string | x        | Min length 1, max length 8192  | Klarna Network Session Token from the Web SDK (Conversion Boosters).        |
| networkData         | string |          | Min length 1, max length 10240 | Optional serialized JSON; enriched data to improve approval rates.         |

---

## Refunds & Cancellations

Refunds for Klarna payments are handled using the standard Paytrail refund API.

- Full and partial refunds are supported.
- Refunds are synchronized to Klarna automatically by Paytrail.

Refer to the [refund documentation](/README#refund) for general behavior and limitations.

Refer to [Cancelling payment](#cancelling-payment) below for payments made with `manualInvoiceActivation`.

---

## Cancelling payment

!> Relevant for Klarna payment method only, and only for payments made with `manualInvoiceActivation`. If you're looking to make a refund, please refer to the [refund](/README#refund) section.

`HTTP POST /payments/{transactionId}/cancel-order` cancels the payment and releases any authorization holds made.

Klarna payments made requiring manual invoice activation are going to be cancelled automatically after the activation window expires.

With `manualInvoiceActivation` you are issuing an authorization hold for the amount. It is advised to issue a cancel for the payment as soon as you know you are going to do so, even though this is an automatic operation at the end of expiry window.

### Request

No request body required.

### Response

Cancel will return `HTTP 201` when successful, or `HTTP 202` when request is received but response to cancellation cannot be given right away.

| Status code | Explanation                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| 201         | Invoice cancelled                                                            |
| 202         | Invoice cancellation requested, status of the payment will be updated asynchronously. |
| 200         | Invoice already cancelled.                                                  |
| 400         | Invalid request. Refer to body.message for more information                 |
| 500         | Other error. Refer to body.message for more information                    |

### Body

| field   | type   | description                                   |
| ------- | ------ | --------------------------------------------- |
| status  | string | Status of activation. `ok` or `error`         |
| message | string | Response details, eg. detailed error message. |
