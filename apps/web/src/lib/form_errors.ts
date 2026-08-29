export const fieldError = (
  form: FormAccountUpdateResult | null | undefined,
  name: string,
) => form?.errorFields?.includes(name) ?? false
