import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import { revealProps } from '@/lib/reveal';

/**
 * The company introduction. Deliberately short, and deliberately makes no claim
 * about years, clients, offices or scale — the section earns its place by saying
 * what the company is for, not how big it is.
 */
export default function Positioning() {
  return (
    <section id="positioning" className="section" aria-labelledby="positioning-heading">
      <div className="container-tl">
        <div className="grid gap-y-10 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-3" {...revealProps()}>
            <p className="label">About</p>
          </div>

          <div className="md:col-span-5" {...revealProps(60)}>
            <h2 id="positioning-heading" className="display-3 max-w-[18ch]">
              Technology is most valuable when it solves something real.
            </h2>
          </div>

          <div className="md:col-span-4" {...revealProps(120)}>
            <p className="body-text">
              TechLoom Innovations brings together technology, product thinking and practical
              problem solving to create digital solutions designed around real needs.
            </p>
            <p className="body-text mt-5">
              We work across two sides of the same discipline: advising on technology decisions,
              and building the software that follows from them. Sadhya, our own learning platform,
              is where that approach is applied to a product we run ourselves.
            </p>
            <Link to="/about" className="link-arrow mt-8">
              More about the company
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
