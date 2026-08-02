import { NewContractForm } from "./new-contract-form";

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | null => {
    const value = params[key];
    return typeof value === "string" ? value : null;
  };

  return (
    <NewContractForm
      prefill={{
        fromLead: one("fromLead"),
        customer: one("customer"),
        site: one("site"),
        value: one("value"),
      }}
    />
  );
}
