export const PUBLIC_COMPANY = {
  legalName: "PEACE IS THE SONG C.I.C.",
  tradingName: "Re-Embroidered Conversations",
  companyNumber: "16883201",
  jurisdiction: "England and Wales",
  companyType:
    "Private company limited by guarantee without share capital; Community Interest Company (CIC)",
  registeredOfficeLines: [
    "82a James Carter Road",
    "Mildenhall, Mildenhall",
    "Suffolk, IP28 7DE",
  ],
} as const;

export const PUBLIC_REGISTERED_OFFICE =
  PUBLIC_COMPANY.registeredOfficeLines.join(", ");

export type LegalDocumentId = "terms" | "privacy";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  version: "1.0" | "1.1" | "1.2";
  effectiveDate:
    "22 September 2026" | "23 September 2026" | "24 September 2026";
  introduction: readonly string[];
  sections: readonly LegalSection[];
};

const companyDescription = `${PUBLIC_COMPANY.legalName}, company number ${PUBLIC_COMPANY.companyNumber}, is a ${PUBLIC_COMPANY.companyType}, registered in ${PUBLIC_COMPANY.jurisdiction}. Its registered office is ${PUBLIC_REGISTERED_OFFICE}.`;

export const TERMS: LegalDocument = {
  id: "terms",
  title: "Terms and Conditions",
  version: "1.2",
  effectiveDate: "24 September 2026",
  introduction: [
    `These Terms are between you and ${PUBLIC_COMPANY.legalName}, trading as ${PUBLIC_COMPANY.tradingName}. Please read them before booking.`,
    "Nothing in these Terms limits any cancellation, refund or other rights you have under applicable consumer law.",
  ],
  sections: [
    {
      id: "about-us",
      title: "About us",
      paragraphs: [
        companyDescription,
        `${PUBLIC_COMPANY.tradingName} is the service and brand through which the company offers these sessions. Shahd Karaeen provides the conversations on the company's behalf.`,
      ],
    },
    {
      id: "service",
      title: "The service",
      paragraphs: [
        "The service is one 55-minute, one-to-one private video listening conversation with Shahd Karaeen for £55 GBP. No subscription or package is required.",
        "It is not therapy, counselling, healthcare, psychiatric treatment or crisis support, and it is not a substitute for professional medical, psychological, psychiatric or emergency support.",
      ],
    },
    {
      id: "booking-payment",
      title: "Booking and payment",
      paragraphs: [
        "You choose an available session, provide your name and email, acknowledge the service boundaries and complete payment through Stripe. Stripe handles your card details; we do not receive or store full payment-card details.",
        "Reaching Stripe or returning from Stripe does not by itself mean that a booking is finally confirmed. Confirmation follows our authoritative payment and booking process. Once confirmed, you receive the session information and joining details.",
        `The contract between you and ${PUBLIC_COMPANY.tradingName} is concluded when payment has been successfully processed and we confirm your booking. Merely opening Stripe Checkout or returning from Stripe does not conclude the contract.`,
      ],
    },
    {
      id: "availability",
      title: "Availability",
      paragraphs: [
        "Displayed availability can change until a time is successfully reserved and the booking is confirmed. Selecting a time does not guarantee it if another booking or calendar commitment is recorded first.",
      ],
    },
    {
      id: "rescheduling",
      title: "Rescheduling",
      paragraphs: [
        "A confirmed booking can be rescheduled through its private management link if the replacement time is currently available. The existing payment remains associated with the booking, and the original booking is protected while the reschedule is safely completed.",
      ],
    },
    {
      id: "cancellation-refunds",
      title: "Cancellation and refunds",
      paragraphs: [
        "Contractual 24-hour policy. Future confirmed bookings can be cancelled through the private management link. Under our automatic refund policy, cancellation at least 24 hours before the scheduled start is eligible for an automatic full refund. Cancellation less than 24 hours before the scheduled start cancels the booking but does not qualify for an automatic refund under this contractual policy.",
        "The contractual 24-hour policy is separate from, and does not restrict or override, your statutory cancellation rights. The automatic-refund calculation in the private booking-management link does not determine or exhaust those rights, and the 24-hour rule is not your only possible entitlement to a refund.",
      ],
    },
    {
      id: "statutory-right-to-cancel",
      title: "Statutory right to cancel",
      paragraphs: [
        "Where the statutory right applies, you may cancel this distance service contract without giving any reason. The cancellation period ends 14 days after the day on which the contract is concluded. As explained under Booking and payment, the contract is concluded when payment has been successfully processed and we confirm your booking.",
        `To exercise this right, give us a clear statement that you wish to cancel before the cancellation period expires. You can write to ${PUBLIC_COMPANY.legalName}, ${PUBLIC_REGISTERED_OFFICE}. No particular form is compulsory; the model cancellation form below may be used but is optional.`,
        "Exercising the statutory right is not restricted by the contractual 24-hour cutoff. In particular, the right does not disappear merely because your booking has been confirmed, payment has been captured, a Google Calendar event or joining link has been created, or the appointment is less than 24 hours away.",
        "If you validly exercise the statutory cancellation right before the service has been supplied, payments due to be reimbursed will be reimbursed without undue delay and no later than 14 days after we are informed of your statutory cancellation. Reimbursement will use the same payment method used for the original transaction unless you expressly agree another method, and you will not incur a reimbursement fee.",
      ],
    },
    {
      id: "starting-service-during-cancellation-period",
      title: "Starting the service during the cancellation period",
      paragraphs: [
        "If you select a session that is due to take place before the end of your statutory 14-day cancellation period and complete the booking subject to these Terms, you expressly request that we provide the service on the selected date even though the cancellation period has not yet expired.",
        "Until the service has been fully performed, the statutory right may continue subject to the applicable rules. If you cancel after performance has begun following your express request, you may be required to pay a proportionate amount for the service already supplied where the law permits this. You will not be charged for service supplied during the cancellation period where the legal prerequisites for such a charge have not been satisfied.",
        "You acknowledge that, where the session is fully performed during the statutory cancellation period following your request for early performance, you will lose the statutory right to cancel once the service has been fully performed.",
        "The service is the 55-minute listening session itself. Reserving the appointment, processing payment, confirming the booking, creating a Google Calendar event or generating a joining link does not mean that the service has started or been fully performed.",
      ],
    },
    {
      id: "model-cancellation-form",
      title: "Model cancellation form",
      paragraphs: [
        "You may copy, print and use this form to tell us that you wish to cancel, but its use is optional.",
        `To: ${PUBLIC_COMPANY.legalName}, ${PUBLIC_REGISTERED_OFFICE}`,
        `I give notice that I cancel my contract for a ${PUBLIC_COMPANY.tradingName} one-to-one session.`,
        "Booking/contract date: ______",
        "Scheduled session date: ______",
        "Name of consumer: ______",
        "Address of consumer: ______",
        "Booking email or reference, if available: ______",
        "Signature, only if this form is sent on paper: ______",
        "Date: ______",
      ],
    },
    {
      id: "session-privacy-recording",
      title: "Session privacy and recording",
      paragraphs: [
        "Sessions are private one-to-one conversations. We do not record a session as part of this service. You must not record, transcribe, livestream or distribute a session without express permission.",
        "Confidentiality is not absolute. Limited disclosure may be necessary and lawful where required by law, in response to a serious and immediate safety concern, to establish, exercise or defend legal rights, or to share necessary information confidentially with professional advisers or service providers for legitimate operational or legal purposes.",
      ],
    },
    {
      id: "third-party-services",
      title: "Third-party services",
      paragraphs: [
        "Delivery depends on third-party services including Stripe, Google Calendar and Google Meet, Resend, Cloudflare Turnstile, Mux, application hosting and database hosting providers. Their own terms and privacy information may also apply to their processing.",
        "Nothing here removes responsibility or consumer rights that cannot lawfully be excluded.",
      ],
    },
    {
      id: "customer-responsibilities",
      title: "Your responsibilities",
      paragraphs: [
        "Please provide accurate booking and email information, ensure you can access the supplied joining link with suitable equipment and connectivity, attend from an environment you consider appropriately private, use the service respectfully and lawfully, and do not record or distribute the session without permission.",
      ],
    },
    {
      id: "no-guaranteed-outcome",
      title: "No guaranteed outcome",
      paragraphs: [
        "No particular emotional, therapeutic, personal or other outcome is promised or guaranteed. You remain responsible for your own decisions and actions.",
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      paragraphs: [
        "The website, brand, written materials and other business content remain owned by the company or their respective rights holders. You do not transfer ownership of your own words, experiences or original material merely by participating in a conversation.",
      ],
    },
    {
      id: "liability-rights",
      title: "Liability and mandatory rights",
      paragraphs: [
        "We provide the service with the reasonable care and skill required by law. Nothing excludes or limits liability where doing so would be unlawful, including liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or mandatory consumer rights.",
        "Subject to those protections, we are responsible for foreseeable loss caused by our breach, not losses that could not reasonably have been foreseen when the contract was formed.",
      ],
    },
    {
      id: "complaints-contact",
      title: "Complaints and contact",
      paragraphs: [
        `Contact ${PUBLIC_COMPANY.legalName} in writing at its registered office: ${PUBLIC_REGISTERED_OFFICE}. Please include enough information for us to identify the booking and understand your concern.`,
      ],
    },
    {
      id: "governing-law",
      title: "Governing law",
      paragraphs: [
        "These Terms are governed by the law of England and Wales. This does not remove mandatory consumer protections or jurisdiction rights available to consumers elsewhere in the UK or another relevant location.",
      ],
    },
    {
      id: "changes-version",
      title: "Changes and document version",
      paragraphs: [
        "We may replace these Terms when the service, law or our practices change. The version applicable to a transaction is the version made available for that transaction; Version 1.2 does not apply retrospectively to a booking entered into under an earlier version. This is Version 1.2, effective 24 September 2026.",
      ],
    },
  ],
};

export const PRIVACY_NOTICE: LegalDocument = {
  id: "privacy",
  title: "Privacy Notice",
  version: "1.0",
  effectiveDate: "22 September 2026",
  introduction: [
    `${PUBLIC_COMPANY.legalName} is the controller for the personal information described in this notice. It provides the service under the ${PUBLIC_COMPANY.tradingName} name.`,
    "This notice explains what the application handles, why it is used, who receives it, how retention is determined and your rights.",
  ],
  sections: [
    {
      id: "who-we-are",
      title: "Who we are",
      paragraphs: [companyDescription],
    },
    {
      id: "information-collected",
      title: "Information we collect",
      paragraphs: [
        "Booking information includes your name, email address, selected appointment date and time, timezone, booking status and the server-recorded timestamp of your service-boundaries acknowledgement. That acknowledgement is not consent to personal-data processing.",
        "Payment records include the Stripe Checkout Session and PaymentIntent identifiers and statuses needed to reconcile a booking. Stripe handles payment-card details; this application does not store full card details.",
        "Calendar and session administration can include your email as a Google Calendar attendee, appointment start and end time, an internal booking correlation identifier, the Google Calendar event identifier and generated Google Meet URL.",
        "Resend receives the recipient email and email content needed to send booking correspondence. We may store the provider message identifier and delivery or finalisation timestamp used by the booking lifecycle.",
      ],
    },
    {
      id: "security-abuse-prevention",
      title: "Security and abuse prevention",
      paragraphs: [
        "We use Cloudflare Turnstile and send its challenge token to Cloudflare for verification. The token is not persisted as booking data.",
        "For rate-limit and active-hold controls, the application derives a keyed/HMAC pseudonymous client identifier from the trusted client network address. The abuse tables store that pseudonymous key rather than the raw address. Pseudonymous information is not anonymous information.",
      ],
    },
    {
      id: "video",
      title: "Introduction video",
      paragraphs: [
        "The public introduction video is delivered through Mux. Mux Data cookies and storage of volume and mute preferences are disabled, but network requests and cookie-less video delivery and analytics processing may still occur. Mux does not receive customer or booking identity from the player configuration.",
      ],
    },
    {
      id: "purposes-lawful-bases",
      title: "Purposes and lawful bases",
      paragraphs: [
        "We use data to take and administer bookings, supply the purchased session, process and reconcile payment, create and update Calendar and Meet information, send booking correspondence, and respond to cancellation or rescheduling requests. Contract, or steps requested before a contract, is generally the relevant basis for this processing.",
        "We use limited data to prevent abuse and protect service reliability and security, and to handle complaints or establish, exercise or defend legal rights, based on legitimate interests where those interests are not overridden by your rights. We retain records needed for legal, accounting and tax obligations where processing is required by law.",
        "We use Mux to deliver the introduction video and limited cookie-less playback analytics to understand video performance and maintain the reliability of the video and service. Our intended lawful basis is our legitimate interests in operating, understanding and maintaining that video and service, where those interests are not overridden by your rights and interests.",
        "The boundaries acknowledgement records that you understood the service boundaries. It is not UK GDPR consent for the processing described in this notice.",
      ],
    },
    {
      id: "processors-recipients",
      title: "Processors and recipients",
      paragraphs: [
        "Providers include Stripe for payment and Checkout; Google for Calendar and Google Meet; Resend for transactional email; Cloudflare for Turnstile and security verification; Mux for video delivery and configured cookie-less video analytics; and Railway for production application and PostgreSQL database hosting.",
        "We may also disclose limited information to confidential professional advisers, regulators, courts or public authorities where necessary and lawful.",
      ],
    },
    {
      id: "international-transfers",
      title: "International transfers",
      paragraphs: [
        "Some providers may process information outside the UK. Where applicable data-protection law treats this as a restricted transfer, appropriate transfer protections are used as required. The exact protection depends on the provider and processing arrangement.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      paragraphs: [
        "The application does not currently automatically delete booking rows after a fixed period. Booking, payment, Calendar and email records are retained according to operational needs and applicable accounting, legal, dispute-resolution and security requirements, taking account of whether the record remains necessary and relevant limitation periods.",
        "The active HOLD or temporary-reservation period is short-lived, as are abuse-protection and rate-limit permit records for their operational purpose. The associated booking row contains booking information and may remain in the booking database after the hold expires or is cancelled; expiry or cancellation does not automatically delete that row. Complaints or legal-claim records may need to be kept while a matter is active and for a reasonable period afterwards.",
      ],
    },
    {
      id: "session-confidentiality",
      title: "Session confidentiality",
      paragraphs: [
        "We do not record the spoken listening session as part of this service and do not routinely publish or disclose what you say. Session content is different from the limited booking metadata necessarily handled by service providers.",
        "Limited disclosure may be necessary where required by law, in response to a serious and immediate safety concern, to establish, exercise or defend legal rights, or to obtain confidential professional or operational support where lawful and proportionate.",
      ],
    },
    {
      id: "cookies-browser-storage",
      title: "Cookies and browser storage",
      paragraphs: [
        "Mux is configured with Mux Data cookies disabled and with volume-preference and mute-preference persistence disabled. This does not mean the entire site is categorically cookie-free: Cloudflare Turnstile, Stripe redirects and other production integrations may process information or use storage under their own applicable configurations.",
      ],
    },
    {
      id: "individual-rights",
      title: "Your individual rights",
      paragraphs: [
        "Depending on the circumstances, you may have rights of access, correction, erasure, restriction, objection and portability, and a right to withdraw consent where a particular activity genuinely relies on consent. These rights are not all absolute and may be limited by lawful retention or other requirements.",
        `To exercise a right, write to ${PUBLIC_COMPANY.legalName} at its registered office: ${PUBLIC_REGISTERED_OFFICE}. You also have the right to complain to the Information Commissioner's Office at ico.org.uk.`,
      ],
    },
    {
      id: "complaints-contact",
      title: "Complaints and contact",
      paragraphs: [
        `Raise a privacy concern by writing to ${PUBLIC_COMPANY.legalName} at its registered office: ${PUBLIC_REGISTERED_OFFICE}. You may also complain to the Information Commissioner's Office.`,
      ],
    },
    {
      id: "changes-version",
      title: "Changes and document version",
      paragraphs: [
        "We may update this notice when our service, providers, processing or legal obligations change. This is Version 1.0, effective 22 September 2026.",
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  privacy: PRIVACY_NOTICE,
} satisfies Record<LegalDocumentId, LegalDocument>;
