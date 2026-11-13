-- =====================================================================
-- FICTIONAL DEMONSTRATION DATA
-- Every record below is invented and flagged with is_demo = true.
-- The app shows a "Demo" badge on these records and excludes them from
-- impact statistics. Delete them before public launch with:
--     delete from public.pet_reports where is_demo;
-- Locations are approximate suburb-level points, not real addresses.
-- Demo records have no photos; Phase 2 adds licensed test images.
-- =====================================================================

insert into public.pet_reports
  (kind, species, pet_name, breed, primary_colour, secondary_colour, size, age_group, sex, desexed,
   collar_description, markings, description, event_at, suburb, postcode, public_lat, public_lng,
   animal_location, reporter_type, is_demo)
values
  ('lost',  'dog', 'Biscuit', 'Cavoodle', 'Apricot', null, 'small', 'young', 'male', true,
   'Red collar with bone-shaped tag', 'White patch on chest',
   'Very friendly, may approach people. Scared of loud noises.',
   now() - interval '1 day', 'Rowville', '3178', -37.9265, 145.2335, null, 'owner', true),

  ('lost',  'cat', 'Miso', 'Domestic shorthair', 'Grey', 'White', 'medium', 'adult', 'female', true,
   'No collar', 'White socks on all four paws, notch in left ear',
   'Indoor cat, likely hiding nearby. Shy with strangers.',
   now() - interval '3 days', 'Knoxfield', '3180', -37.8905, 145.2490, null, 'owner', true),

  ('lost',  'dog', 'Rosie', 'Kelpie cross', 'Black', 'Tan', 'medium', 'adult', 'female', true,
   'Blue nylon collar', 'Tan eyebrows, white tip on tail',
   'Escaped through a side gate. Very fast, please do not chase.',
   now() - interval '2 days', 'Wantirna', '3152', -37.8530, 145.2275, null, 'owner', true),

  ('lost',  'dog', 'Ziggy', 'Staffordshire bull terrier', 'Brindle', 'White', 'medium', 'adult', 'male', true,
   'Black harness', 'White blaze down face',
   'Gentle with people, may be wary of other dogs.',
   now() - interval '5 days', 'Ferntree Gully', '3156', -37.8845, 145.2945, null, 'owner', true),

  ('lost',  'cat', 'Pumpkin', 'Domestic longhair', 'Ginger', null, 'large', 'senior', 'male', true,
   'Green breakaway collar with bell', 'Fluffy tail, slightly overweight',
   'Elderly cat on daily medication.',
   now() - interval '6 hours', 'Scoresby', '3179', -37.9005, 145.2335, null, 'owner', true),

  ('lost',  'dog', 'Luna', 'Border collie', 'Black', 'White', 'medium', 'young', 'female', false,
   'Pink collar', 'White collar ring and white front legs',
   'Responds to her name and whistles.',
   now() - interval '4 days', 'Boronia', '3155', -37.8605, 145.2855, null, 'owner', true),

  ('lost',  'cat', 'Shadow', 'Domestic shorthair', 'Black', null, 'medium', 'adult', 'male', true,
   'No collar', 'Small white spot on chest',
   'Microchipped. Last seen near the train line.',
   now() - interval '8 days', 'Bayswater', '3153', -37.8455, 145.2680, null, 'owner', true),

  ('lost',  'dog', 'Pepper', 'Miniature schnauzer', 'Grey', 'Silver', 'small', 'senior', 'female', true,
   'Purple collar', 'Grey beard, slightly cloudy eyes',
   'Hard of hearing, may not respond to calls.',
   now() - interval '1 day', 'Wheelers Hill', '3150', -37.9050, 145.1885, null, 'owner', true),

  ('found', 'dog', null, 'Cavoodle (possibly)', 'Apricot', null, 'small', 'young', 'male', null,
   'Red collar, no tag', 'White patch on chest',
   'Found wandering near a playground. Friendly and well cared for.',
   now() - interval '12 hours', 'Lysterfield', '3156', -37.9355, 145.2995, 'with_vet', 'finder', true),

  ('found', 'cat', null, 'Domestic shorthair', 'Grey', 'White', 'medium', 'adult', 'female', null,
   'No collar', 'White paws, notched ear',
   'Has been sitting in our carport for two days.',
   now() - interval '1 day', 'Rowville', '3178', -37.9150, 145.2450, 'with_finder', 'finder', true),

  ('found', 'dog', null, 'Kelpie type', 'Black', 'Tan', 'medium', 'adult', 'female', null,
   'Blue collar', 'Tan markings above eyes',
   'Taken to a local vet to be scanned for a microchip.',
   now() - interval '1 day', 'Vermont South', '3133', -37.8575, 145.1830, 'with_vet', 'finder', true),

  ('found', 'cat', null, 'Domestic longhair', 'Tortoiseshell', null, 'small', 'young', 'female', null,
   'No collar', 'Orange patch on nose',
   'Young cat, very vocal. Seems lost.',
   now() - interval '2 days', 'Knoxfield', '3180', -37.8840, 145.2560, 'with_finder', 'finder', true),

  ('found', 'dog', null, 'Labrador retriever', 'Yellow', null, 'large', 'adult', 'male', null,
   'Brown leather collar', 'Scar on left front leg',
   'Found on a walking track. Handed to the council ranger.',
   now() - interval '3 days', 'The Basin', '3154', -37.8525, 145.3105, 'with_council', 'finder', true),

  ('found', 'dog', null, 'Jack Russell terrier', 'White', 'Brown', 'small', 'adult', 'female', null,
   'No collar', 'Brown patches over both eyes',
   'Very energetic. Taken to an animal shelter.',
   now() - interval '6 days', 'Mulgrave', '3170', -37.9270, 145.1690, 'with_shelter', 'finder', true),

  ('found', 'cat', null, 'Domestic shorthair', 'Black', 'White', 'medium', 'adult', 'male', null,
   'Red collar', 'White bib and whiskers',
   'Seen in the area for a week, looks thin.',
   now() - interval '4 days', 'Upper Ferntree Gully', '3156', -37.8930, 145.3110, 'not_contained', 'finder', true);

-- Matching demo pairs (for testing once Phase 2 matching is live):
--   Biscuit (lost, Rowville)   <-> apricot cavoodle found in Lysterfield
--   Miso (lost, Knoxfield)     <-> grey/white cat found in Rowville
--   Rosie (lost, Wantirna)     <-> black/tan kelpie found in Vermont South
