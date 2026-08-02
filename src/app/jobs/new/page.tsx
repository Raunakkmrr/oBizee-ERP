import { NewJobForm } from "./new-job-form";

/**
 * Server page: reads the query string and hands it to the client form as props.
 * `searchParams` is a Promise in this version of Next.
 */
export default async function NewJobPage({
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
    <NewJobForm
      prefill={{
        fromLead: one("fromLead"),
        customer: one("customer"),
        site: one("site"),
        service: one("service"),
      }}
    />
  );
}
