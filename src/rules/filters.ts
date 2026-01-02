import { UnsubscribeRule } from "../db/rules";

export interface EmailMetadata {
  from?: string;
  subject?: string;
}

export function shouldSkipEmail(rules: UnsubscribeRule[], email: EmailMetadata): boolean {
  return rules.some((rule) => {
    const fromMatch =
      !rule.fromAddress ||
      (email.from && email.from.toLowerCase() === rule.fromAddress.toLowerCase());

    const subjectMatch =
      !rule.subjectContains ||
      (email.subject &&
        email.subject.toLowerCase().includes(rule.subjectContains.toLowerCase()));

    return fromMatch && subjectMatch;
  });
}
