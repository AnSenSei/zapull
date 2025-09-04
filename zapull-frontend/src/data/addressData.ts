// 地址数据：国家、州/省、城市三级联动

interface StateData {
  name: string;
  cities: string[];
}

interface CountryData {
  name: string;
  states: StateData[];
}

// 美国和加拿大的地址数据
export const addressData: CountryData[] = [
  {
    name: "United States",
    states: [
      {
        name: "Alabama",
        cities: ["Birmingham", "Montgomery", "Mobile", "Huntsville", "Tuscaloosa"]
      },
      {
        name: "Alaska",
        cities: ["Anchorage", "Fairbanks", "Juneau", "Sitka", "Ketchikan"]
      },
      {
        name: "Arizona",
        cities: ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale"]
      },
      {
        name: "California",
        cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"]
      },
      {
        name: "Colorado",
        cities: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood"]
      },
      {
        name: "Florida",
        cities: ["Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg"]
      },
      {
        name: "New York",
        cities: ["New York City", "Buffalo", "Rochester", "Yonkers", "Syracuse"]
      },
      {
        name: "Texas",
        cities: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth"]
      },
      {
        name: "Washington",
        cities: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue"]
      }
    ]
  },
  {
    name: "Canada",
    states: [
      {
        name: "Alberta",
        cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "St. Albert"]
      },
      {
        name: "British Columbia",
        cities: ["Vancouver", "Victoria", "Surrey", "Burnaby", "Richmond"]
      },
      {
        name: "Manitoba",
        cities: ["Winnipeg", "Brandon", "Steinbach", "Thompson", "Portage la Prairie"]
      },
      {
        name: "Ontario",
        cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"]
      },
      {
        name: "Quebec",
        cities: ["Montreal", "Quebec City", "Laval", "Gatineau", "Longueuil"]
      }
    ]
  },
  {
    name: "United Kingdom",
    states: [
      {
        name: "England",
        cities: ["London", "Manchester", "Birmingham", "Liverpool", "Leeds"]
      },
      {
        name: "Scotland",
        cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"]
      },
      {
        name: "Wales",
        cities: ["Cardiff", "Swansea", "Newport", "Bangor", "St Davids"]
      }
    ]
  },
  {
    name: "Australia",
    states: [
      {
        name: "New South Wales",
        cities: ["Sydney", "Newcastle", "Wollongong", "Wagga Wagga", "Coffs Harbour"]
      },
      {
        name: "Queensland",
        cities: ["Brisbane", "Gold Coast", "Cairns", "Townsville", "Toowoomba"]
      },
      {
        name: "Victoria",
        cities: ["Melbourne", "Geelong", "Ballarat", "Bendigo", "Shepparton"]
      }
    ]
  },
  {
    name: "China",
    states: [
      {
        name: "Beijing",
        cities: ["Dongcheng", "Xicheng", "Chaoyang", "Haidian", "Fengtai"]
      },
      {
        name: "Shanghai",
        cities: ["Pudong", "Huangpu", "Jing'an", "Xuhui", "Hongkou"]
      },
      {
        name: "Guangdong",
        cities: ["Guangzhou", "Shenzhen", "Dongguan", "Foshan", "Zhuhai"]
      }
    ]
  }
];

// 根据国家获取州/省列表
export const getStatesByCountry = (country: string): StateData[] => {
  const countryData = addressData.find(c => c.name === country);
  return countryData ? countryData.states : [];
};

// 根据国家和州/省获取城市列表
export const getCitiesByState = (country: string, state: string): string[] => {
  const countryData = addressData.find(c => c.name === country);
  if (!countryData) return [];
  
  const stateData = countryData.states.find(s => s.name === state);
  return stateData ? stateData.cities : [];
};

// 获取所有国家列表
export const getCountries = (): string[] => {
  return addressData.map(country => country.name);
};