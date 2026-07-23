"use client";

// Share Contact Information button (brief Task 5).
//
// The `available` prop must be computed server-side from the ACTOR's stored date
// of birth (isContactSharingAvailableForActor in lib/contact.ts). When false,
// this renders NOTHING — the control must not appear at all on any account 17 or
// under, including a graduated 13–17 standard account. Hiding the button is a
// UX affordance; the real gate is enforced server-side in shareContactInformation.

export function ShareContactButton({
  available,
  onShare,
}: {
  available: boolean;
  onShare: () => void;
}) {
  if (!available) return null;
  return (
    <button type="button" data-testid="share-contact" onClick={onShare}>
      Share contact information
    </button>
  );
}

export default ShareContactButton;
