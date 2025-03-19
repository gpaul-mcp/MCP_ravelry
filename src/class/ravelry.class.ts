import { DetailedPattern, MultipleDetailedPatternResponse } from '@/types/patternDetailed';
import Pattern, { SimplePatternReponse } from '@/types/patternSimple';
import axios from 'axios';

type ResponseType = SimplePatternReponse | DetailedPattern | MultipleDetailedPatternResponse | null;

export default class Ravelry {
  private authorization: string;

  constructor(user: string, password: string) {
    this.authorization = Buffer.from(`${user}:${password}`).toString('base64');
  }

  private async request(url: string, method: string): Promise<ResponseType> {
    try {
      const response = await axios({
        method,
        url,
        headers: {
          Authorization: `Basic ${this.authorization}`,
        },
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(error.response?.data);
        return null;
      }
      console.error(error);
      return null;
    }
  }

  public async searchPatterns(
    query: string,
    page: number,
    craft: string,
    availability?: string,
  ): Promise<Pattern[] | null> {
    const url = `https://api.ravelry.com/patterns/search.json?query=${query}&page=${page}&craft=${craft}&availability=${
      availability ? `${availability}` : 'free'
    }`;

    let response = await this.request(url, 'GET');
    if (!response) {
      return null;
    }
    response = response as SimplePatternReponse;

    if (Array.isArray(response.patterns)) {
      return response.patterns;
    } else {
      console.error('Unexpected response format:', response);
      return null;
    }
  }

  public async getPatternDetails(id: number): Promise<DetailedPattern | null> {
    const url = `https://api.ravelry.com/patterns/${id}.json`;
    const response = await this.request(url, 'GET');
    if (!response) {
      return null;
    }

    return response as DetailedPattern;
  }

  public async getMultiplePatternDetails(
    ids: number[],
  ): Promise<MultipleDetailedPatternResponse | null> {
    const url = `https://api.ravelry.com/patterns.json?ids=${ids.join(' ')}`;
    const response = await this.request(url, 'GET');
    if (!response) {
      return null;
    }

    return response as MultipleDetailedPatternResponse;
  }
}
