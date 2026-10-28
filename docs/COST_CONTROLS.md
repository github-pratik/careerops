# Zero-cost deployment boundary

Updated 28 October 2026. The owner's target is zero recurring cost. An exception ceiling is not permission to spend. No paid substitution, account upgrade or extra model credits may be purchased without a specific proposal and approval. Deployment is currently held by the owner; cost verification alone does not revoke that hold.

## Verified hosting facts

- Oracle Console identified the account as Free Tier/free trial, with Always Free resources remaining after trial expiry. The selected deployment region is its home region.
- A read-only Block Volume regional limits query showed `total-free-storage-gb-regional`: limit 200 GB, usage 0 GB, available 200 GB. Free backup count showed limit 5, usage 0, available 5. This improves on earlier checks of individual volume lists.
- The held draft uses an Always Free-eligible A1 ARM shape with 1 OCPU/6 GB and a default 46.6 GB boot volume. No custom boot performance or additional block volume was selected. Combined proposed storage is below the verified free regional allowance, so the boot volume is expected to be covered by that allowance, subject to Oracle's eligibility rules.
- Compute limits filtered to A1 in the proposed availability domain showed zero current CPU and memory usage, with the service limits/availability labelled Dynamic. That is not a guarantee of physical host capacity or a reservation.
- Oracle's ongoing published A1 free allowance is 1,500 OCPU-hours and 9,000 GB-hours monthly. At 744 hours, the proposed instance uses 744 OCPU-hours and 4,464 GB-hours. It therefore fits that allowance without relying on trial credit, assuming no other usage consumes it.
- The console's gross estimate displayed a boot-volume charge, but explicitly excluded tier pricing. That amount is not sufficient by itself to establish the actual free-tier bill. No absolute invoice guarantee can be inferred from this review.

Sources: [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [cost estimates](https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/signingup_topic-Estimating_Costs.htm).

## Execution constraints

- Preserve Free Tier; do not upgrade to Pay As You Go. Do not use an expiring credit balance as proof of a sustainable free deployment.
- Provision only the reviewed configuration after fresh creation approval. If free capacity is unavailable, stop and report the capacity error; do not choose a paid shape or another paid region.
- Use self-hosted PostgreSQL and the application on the VM initially, rather than enabling a separately billed managed database. Keep services private behind the HTTPS proxy.
- Avoid paid load balancers, NAT gateways, extra disks, storage-performance upgrades, paid monitoring subscriptions and purchased domains. Verify any public-IP, hostname/DNS, network and backup resource before creating it; network/storage allowances are finite.
- Keep backup retention within the selected free allowance and implement an actual restore check. A backup-slot quota is not evidence that backups are already configured.
- Free model quotas are finite. Cache requests, apply quotas/backoff and pause provider work when exhausted. Do not buy fallback credits or promise unlimited automation. Live provider access and consent remain unconfigured.
- GitHub Codespaces is development only. Keep its existing paid-usage block; included compute and storage quotas still limit use, and stopping does not eliminate all storage consumption.

## Remaining release work

Obtain fresh approval to create the held VM; inspect the actual creation result/capacity; finalize and price-check public-IP/routing/HTTPS access; validate the ARM build; configure persistent private storage and backup/restore; migrate private records only after those checks pass. The review dashboard is the first release. Submission and mail are not implemented.
