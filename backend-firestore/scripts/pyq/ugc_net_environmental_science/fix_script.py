with open('scripts/pyq/ugc_net_environmental_science/extract-environmental-science-papers.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('ugc_net_electronic_science', 'ugc_net_environmental_science')
text = text.replace('verified_electronic_science_manifest.json', 'verified_environmental_science_manifest.json')
text = text.replace('ugc_net_electronic_science_all_extracted_pyqs.json', 'ugc_net_environmental_science_all_extracted_pyqs.json')
text = text.replace('ELECTRONIC_SCIENCE_TAXONOMY', 'ENVIRONMENTAL_SCIENCE_TAXONOMY')
text = text.replace('classify_electronic_science_text', 'classify_environmental_science_text')
text = text.replace('extract_from_electronic_science_pdf', 'extract_from_environmental_science_pdf')
text = text.replace('ELECTRONIC SCIENCE', 'ENVIRONMENTAL SCIENCE')
text = text.replace('ELECTRONICS', 'ENVIRONMENTAL')
text = text.replace('Electronic Science', 'Environmental Sciences')
text = text.replace(\ subjectCode: 88\", \"subjectCode: 89 \)
text = text.replace('\subjectCode\: \88\', '\subjectCode\: \89\')
text = text.replace('ugc_net:electronic_science_10:', 'ugc_net:environmental_sciences_89:')

env_taxonomy = '''ENVIRONMENTAL_SCIENCE_TAXONOMY = [
    (1, 'UNIT_1_FUNDAMENTALS_OF_ENVIRONMENTAL_SCIENCES', 'Fundamentals of Environmental Sciences', [
        'atmosphere', 'hydrosphere', 'lithosphere', 'biosphere', 'thermodynamics', 'lapse rate', 'wind rose', 'meteorology', 'agro-climatic', 'carrying capacity'
    ]),
    (2, 'UNIT_2_ENVIRONMENTAL_CHEMISTRY', 'Environmental Chemistry', [
        'stoichiometry', 'gibbs', 'photochemical smog', 'acid rain', 'aas', 'chromatography', 'spectrophotometry', 'heavy metal', 'pesticide', 'biogeochemical', 'nitrogen cycle', 'redox'
    ]),
    (3, 'UNIT_3_ENVIRONMENTAL_BIOLOGY', 'Environmental Biology', [
        'ecosystem', 'biodiversity', 'ecological pyramid', 'food web', 'food chain', 'succession', 'iucn', 'population ecology', 'carrying capacity', 'hotspot', 'speciation'
    ]),
    (4, 'UNIT_4_ENVIRONMENTAL_GEOSCIENCES', 'Environmental Geosciences', [
        'plate tectonics', 'earthquake', 'volcano', 'fault', 'aquifer', 'darcy', 'groundwater', 'igneous', 'sedimentary', 'metamorphic', 'geomorphology', 'weathering', 'crust', 'mantle'
    ]),
    (5, 'UNIT_5_ENERGY_AND_ENVIRONMENT', 'Energy and Environment', [
        'solar energy', 'photovoltaic', 'wind energy', 'geothermal', 'biomass', 'biogas', 'fossil fuel', 'calorific value', 'coal bed methane', 'gas hydrate', 'nuclear reactor', 'otec'
    ]),
    (6, 'UNIT_6_ENVIRONMENTAL_POLLUTION_AND_CONTROL', 'Environmental Pollution and Control', [
        'air pollution', 'water pollution', 'noise pollution', 'electrostatic precipitator', 'cyclone separator', 'scrubber', 'plume', 'decibel', 'pm2.5', 'pm10', 'bod', 'cod', 'dissolved oxygen'
    ]),
    (7, 'UNIT_7_SOLID_AND_HAZARDOUS_WASTE_MANAGEMENT', 'Solid and Hazardous Waste Management', [
        'solid waste', 'hazardous waste', 'leachate', 'landfill', 'composting', 'incineration', 'pyrolysis', 'biomedical waste', 'e-waste', 'plastic waste', 'fly ash'
    ]),
    (8, 'UNIT_8_ENVIRONMENTAL_ASSESSMENT_MANAGEMENT_LEGISLATION', 'Environmental Assessment, Management and Legislation', [
        'eia', 'impact assessment', 'environment protection act', 'water act', 'air act', 'wildlife protection', 'forest conservation', 'iso 14000', 'life cycle assessment', 'ngt'
    ]),
    (9, 'UNIT_9_STATISTICAL_APPROACHES_AND_MODELLING', 'Statistical Approaches and Modelling in Environmental Sciences', [
        'regression', 'anova', 'hypothesis', 'chi-square', 'poisson', 'binomial', 'standard deviation', 'standard error', 'kurtosis', 'skewness', 'gaussian plume', 'streeter-phelps'
    ]),
    (10, 'UNIT_10_CONTEMPORARY_ENVIRONMENTAL_ISSUES', 'Contemporary Environmental Issues', [
        'climate change', 'napcc', 'national action plan', 'kyoto protocol', 'paris agreement', 'montreal protocol', 'ozone depletion', 'global warming', 'chipko', 'bhopal gas', 'sdg'
    ])
]'''

import re
text = re.sub(r'ENVIRONMENTAL_SCIENCE_TAXONOMY = \[[\s\S]+?\n\]', env_taxonomy, text)

with open('scripts/pyq/ugc_net_environmental_science/extract-environmental-science-papers.py', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated extract-environmental-science-papers.py cleanly!')
