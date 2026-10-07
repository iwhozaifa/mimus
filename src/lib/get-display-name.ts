function fromEmail(email: string): string {
  return email.split('@')[0] ?? email;
}

export function getFirstName(fullName: string | null, email: string): string {
  if (fullName && fullName.trim().length > 0) {
    return fullName.trim().split(/\s+/)[0];
  }
  return fromEmail(email);
}

export function getInitials(fullName: string | null, email: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/);
    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
    if (initials) {
      return initials;
    }
  }
  const local = fromEmail(email);
  return local.slice(0, 2).toUpperCase();
}
