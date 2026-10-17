# Architecture rules
- Keep AI book retrieval and health measurements in protected public tables; only server functions access embeddings, preventing exposure of book contents and patient data.
- Provision storage buckets with the storage tools, separately from SQL policies, because managed storage rejects bucket writes in migrations.
- Keep medical responses source-grounded; unavailable passages must route to a doctor rather than invent advice.
