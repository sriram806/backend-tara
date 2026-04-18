export type PlanName = 'FREE' | 'PRO' | 'ENTERPRISE';
export type BillableFeature = 'career' | 'resume' | 'roadmap' | 'jobs' | 'interview' | 'assessment';

export type PlanConfig = {
  name: PlanName;
  amountInPaise: number;
  currency: 'INR';
  monthlyLimits: Record<BillableFeature, number | null>;
  restrictedFeatures: BillableFeature[];
};

export const PLAN_CONFIG: Record<PlanName, PlanConfig> = {
  FREE: {
    name: 'FREE',
    amountInPaise: 0,
    currency: 'INR',
    monthlyLimits: {
      career: 5,
      resume: 2,
      roadmap: 2,
      jobs: 3,
      interview: 0,
      assessment: 6
    },
    restrictedFeatures: ['interview']
  },
  PRO: {
    name: 'PRO',
    amountInPaise: 49_900,
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
    amountInPaise: 149_900,
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
