export type PlanName = 'NONE' | 'LITE' | 'PRO' | 'ENTERPRISE';
export type BillableFeature = 'career' | 'resume' | 'roadmap' | 'jobs' | 'interview' | 'assessment';

export type PlanConfig = {
  name: PlanName;
  amountInPaise: number;
  currency: 'INR';
  monthlyLimits: Record<BillableFeature, number | null>;
  restrictedFeatures: BillableFeature[];
};

export const PLAN_CONFIG: Record<PlanName, PlanConfig> = {
  NONE: {
    name: 'NONE',
    amountInPaise: 0,
    currency: 'INR',
    monthlyLimits: {
      career: 1,
      resume: 1,
      roadmap: 1,
      jobs: 5,
      interview: 0,
      assessment: 2
    },
    restrictedFeatures: ['interview']
  },
  LITE: {
    name: 'LITE',
    amountInPaise: 219_900,
    currency: 'INR',
    monthlyLimits: {
      career: 10,
      resume: 5,
      roadmap: 5,
      jobs: 10,
      interview: 0,
      assessment: 10
    },
    restrictedFeatures: ['interview']
  },
  PRO: {
    name: 'PRO',
    amountInPaise: 299_900,
    currency: 'INR',
    monthlyLimits: {
      career: null,
      resume: null,
      roadmap: null,
      jobs: null,
      interview: null,
      assessment: null
    },
    restrictedFeatures: []
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    amountInPaise: 1_000_000, // Custom high limit for base orgs
    currency: 'INR',
    monthlyLimits: {
      career: null,
      resume: null,
      roadmap: null,
      jobs: null,
      interview: null,
      assessment: null
    },
    restrictedFeatures: []
  }
};

export function getPlanConfig(plan: PlanName) {
  return PLAN_CONFIG[plan];
}
