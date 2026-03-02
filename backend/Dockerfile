# backend/Dockerfile
# container image for the FastAPI / SQLAlchemy application

FROM python:3.12-slim

# Create application directory
WORKDIR /app

# install dependencies early to take advantage of layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# copy the rest of the python code
COPY app ./app

# port that the uvicorn server will listen on
EXPOSE 8000

# default command; environment variables control the database connection
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
