import ApproachTimeline from '@/components/sections/ApproachTimeline';
import Capabilities from '@/components/sections/Capabilities';
import ContactCTA from '@/components/sections/ContactCTA';
import EngineeringPrinciples from '@/components/sections/EngineeringPrinciples';
import Hero from '@/components/sections/Hero';
import Positioning from '@/components/sections/Positioning';
import Principles from '@/components/sections/Principles';
import ProductStudio from '@/components/sections/ProductStudio';
import SadhyaFeature from '@/components/sections/SadhyaFeature';
import TechnologyPurpose from '@/components/sections/TechnologyPurpose';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * The home page, ordered as one argument rather than as a list of sections.
 *
 *   the gap        an idea is only the beginning
 *   the method     the four stages that close it
 *   the work       what we build, and what with
 *   the standard   what "good" means once it ships
 *   the proof      a product we run ourselves
 *   the company    how we think
 *
 * Process sits immediately under the core message on purpose: naming a gap and
 * then not saying how it gets closed is the shape of an advertisement.
 */
export default function Home() {
  useSeo({
    title: `${COMPANY.name} | Technology & Product Engineering`,
    description: COMPANY.descriptor,
    path: '/',
  });

  return (
    <>
      <Hero />
      <Positioning />
      <ApproachTimeline />
      <Capabilities />
      <TechnologyPurpose />
      <EngineeringPrinciples />
      <SadhyaFeature />
      <ProductStudio />
      <Principles />
      <ContactCTA />
    </>
  );
}
