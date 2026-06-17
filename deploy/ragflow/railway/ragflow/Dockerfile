FROM infiniflow/ragflow:v0.26.0

COPY entrypoint.sh /ragflow/entrypoint.sh
COPY service_conf.yaml.template /ragflow/conf/service_conf.yaml.template

RUN chmod +x /ragflow/entrypoint.sh

EXPOSE 80 443 9380 9381 9382 9383 9384

ENTRYPOINT ["/ragflow/entrypoint.sh"]
CMD ["--enable-adminserver"]
