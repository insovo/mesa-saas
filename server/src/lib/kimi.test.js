import assert from "node:assert/strict";
import test from "node:test";

import { buildResumeDisplayFields } from "./kimi.js";

test("buildResumeDisplayFields keeps factual resume skills, experience, and education", () => {
  const fields = buildResumeDisplayFields({
    skills: ["ISO26262 ASIL", "DFMEA-PFMEA", "CAD tools (CATIA, Pro-E, SOLIDWORKS)"],
    experience: [
      {
        period: "2023.10 – 至今",
        company: "STELLANTIS",
        title: "HW PROTOTYPE DEVELOPMENT",
        summary: "HPC / ZCU / Edge Computers internalization design hardware prototype management",
      },
      {
        period: "2021.05 – 2023.09",
        company: "STELLANTIS",
        title: "RESPONSABLE SYNTHESE ARCHI. EE",
        summary: "EE architecture synthesis for eDPEO project wave1 and wave2",
      },
    ],
    educationHistory: [
      {
        period: "2006.07",
        school: "South China University of Technology",
        degree: "Master",
        major: "Mechanical Engineering and Automation (Robot design)",
      },
      {
        period: "2005.07",
        school: "École Supérieur d’Ingénieur de Chambéry - ESIGEC Université Savoie Mont Blanc",
        degree: "Master",
        major: "Optimisation Engineering of Composite Material",
      },
    ],
  });

  assert.equal(
    fields.skills,
    "- ISO26262 ASIL\n- DFMEA-PFMEA\n- CAD tools (CATIA, Pro-E, SOLIDWORKS)"
  );
  assert.equal(
    fields.experience,
    "- STELLANTIS HW PROTOTYPE DEVELOPMENT (2023.10 – 至今) — HPC / ZCU / Edge Computers internalization design hardware prototype management\n- STELLANTIS RESPONSABLE SYNTHESE ARCHI. EE (2021.05 – 2023.09) — EE architecture synthesis for eDPEO project wave1 and wave2"
  );
  assert.equal(
    fields.educationHistory,
    "- South China University of Technology Master Mechanical Engineering and Automation (Robot design) (2006.07)\n- École Supérieur d’Ingénieur de Chambéry - ESIGEC Université Savoie Mont Blanc Master Optimisation Engineering of Composite Material (2005.07)"
  );
});
