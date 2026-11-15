/** What small, medium and large mean on a job. Shown beside the type wherever a job is described. */
export const JOB_SIZES: { key: "small" | "medium" | "large"; label: string; description: string }[] = [
  { key: "small", label: "Small", description: "Under an hour for one person. About a bag or less of litter, or a short stretch of sidewalk." },
  { key: "medium", label: "Medium", description: "One to three hours for one person. A few bags, or a full block frontage or small lot." },
  { key: "large", label: "Large", description: "Half a day or more, or best with two people. Many bags or a big area." },
];

export function jobSize(key: string | null | undefined) {
  return JOB_SIZES.find((s) => s.key === key);
}
