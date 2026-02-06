export default function ApplyCta() {
  return (
    <section className="apply-cta">
      <div>
        <h3>Apply to raise on StartupManch</h3>
        <p>
          Join India&apos;s founder network. Share your traction, set your ask, and
          connect with verified investors.
        </p>
      </div>
      <form className="apply-form">
        <input type="text" placeholder="Startup name" />
        <input type="text" placeholder="Funding stage" />
        <input type="text" placeholder="Funding ask (INR)" />
        <button type="button">Submit application</button>
      </form>
    </section>
  );
}
