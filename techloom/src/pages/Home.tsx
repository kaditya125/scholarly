import ApproachTimeline from '@/components/sections/ApproachTimeline';
import Capabilities from '@/components/sections/Capabilities';
import ContactCTA from '@/components/sections/ContactCTA';
import Hero from '@/components/sections/Hero';
import Positioning from '@/components/sections/Positioning';
import Principles from '@/components/sections/Principles';
import ProductStudio from '@/components/sections/ProductStudio';
import SadhyaFeature from '@/components/sections/SadhyaFeature';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

export default function Home() {
  useSeo({
    title: `${COMPANY.name} | Technology & Digital Solutions`,
    description: COMPANY.descriptor,
    path: '/',
  });

  return (
    <>
      <Hero />
      <Positioning />
      <Capabilities />
      <ApproachTimeline />
      <SadhyaFeature />
      <ProductStudio />
      <Principles />
      <ContactCTA />
    </>
  );
}
