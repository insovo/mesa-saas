export function jobText(job) {
  return [job.title, job.description, ...(job.responsibilities || []).map((r) => `职责:${r}`), ...(job.requirements || []).map((r) => `要求:${r}`), ...(job.nice || []).map((r) => `优先:${r}`),
    job.educationRequirement && `学历:${job.educationRequirement}`, job.yearsExpRange && `年限:${job.yearsExpRange}`, job.languageRequirement && `语言:${job.languageRequirement}`, job.location && `地点:${job.location}`, job.level && `职级:${job.level}`].filter(Boolean).join("\n");
}
